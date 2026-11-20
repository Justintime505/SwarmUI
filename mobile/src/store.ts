import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { api } from '@/api/client'
import { startGeneration, type GenStatus } from '@/api/generate'
import { cleanModelName, type SwarmModel } from '@/api/models'
import { fileToScaledDataUrl } from '@/lib/utils'

/** Aspect ratios offered, with SwarmUI's reference size for each at a 512 base (see T2IParamTypes.AspectRatioToSizeReference). */
export const ASPECTS: Record<string, [number, number]> = {
  '1:1': [512, 512],
  '3:4': [448, 576],
  '2:3': [416, 608],
  '9:16': [384, 672],
  '4:3': [576, 448],
  '3:2': [608, 416],
  '16:9': [672, 384],
}

/** Pixel size for an aspect ratio, scaled to the model's native side length. Mirrors SwarmUI's own math. */
export function sizeFor(aspect: string, side: number): [number, number] {
  const ref = ASPECTS[aspect] || ASPECTS['1:1']
  const scale = side / 512
  return [Math.round((ref[0] * scale) / 16) * 16, Math.round((ref[1] * scale) / 16) * 16]
}

/** The offered aspect ratio closest to an image's shape. */
export function closestAspect(width: number, height: number): string {
  const target = Math.log(width / height)
  let best = '1:1'
  let bestDiff = Infinity
  for (const [name, [w, h]] of Object.entries(ASPECTS)) {
    const diff = Math.abs(Math.log(w / h) - target)
    if (diff < bestDiff) {
      best = name
      bestDiff = diff
    }
  }
  return best
}

export type LoraChoice = { name: string; weight: number }

/** What the user has chosen for the next generation. Saved in the browser so it survives a reload. */
type Settings = {
  prompt: string
  negativePrompt: string
  /** Full model name as listed by SwarmUI, or null before one is chosen. */
  model: string | null
  /** The chosen model's native side length in pixels (e.g. 1024 for SDXL). */
  side: number
  steps: number
  cfgScale: number
  /** -1 means a new random seed each time. */
  seed: number
  images: number
  aspect: string
  loras: LoraChoice[]
  /** 0 to 1: how far a generation may move away from the starting image. */
  initCreativity: number
  /** Output folder for new images. Empty means SwarmUI's default (raw/, by date). */
  folder: string
  /** Folders created in the app. Kept so a new, still-empty folder stays listed. */
  customFolders: string[]
  /** Which profile `folder` and `customFolders` currently belong to (empty string = the shared library). */
  foldersProfile: string
  /** Folder choices remembered for the other profiles, keyed by profile ID. */
  savedFolders: Record<string, { folder: string; customFolders: string[] }>
}

/** One brush stroke of the inpainting mask. `points` is a flat x,y list in image pixels; `size` is the brush width in image pixels. */
export type MaskStroke = { size: number; points: number[] }

/** A generated image. `temp` marks an unsaved live preview, which the next preview replaces. */
export type ResultImage = { src: string; metadata: string | null; temp?: boolean }

type Runtime = {
  /** Starting image for image-to-image as a data URL. Not saved across reloads (it can be several MB). */
  initImage: string | null
  /** Pixel size of the starting image. */
  initSize: { width: number; height: number } | null
  /** Inpainting mask as a data URL (white = change, black = keep), or null to change the whole image. */
  maskImage: string | null
  /** The strokes the mask was painted with, kept so it can be edited again. */
  maskStrokes: MaskStroke[]
  running: boolean
  cancelling: boolean
  /** "Generate Forever": start another run as soon as each one finishes. */
  forever: boolean
  /** "Generate Previews": make a quick unsaved image whenever the prompt or settings change. */
  previews: boolean
  statusText: string
  /** Overall progress of the current request, 0 to 1. */
  progress: number
  /** Latest live preview while generating. */
  preview: string | null
  /** Images generated this session, newest first. */
  results: ResultImage[]
  /** Index into `results` of the image being shown. */
  current: number
  error: string | null
}

type Actions = {
  set: (patch: Partial<Settings>) => void
  selectModel: (model: SwarmModel) => void
  toggleLora: (name: string, defaultWeight: number) => void
  setLoraWeight: (name: string, weight: number) => void
  setInitImage: (dataUrl: string | null, width?: number, height?: number) => void
  setMask: (dataUrl: string | null, strokes: MaskStroke[]) => void
  /** Loads an image from a URL as the starting image. Resolves to false (and sets an error) if it cannot be loaded. */
  startFromUrl: (url: string) => Promise<boolean>
  /** Makes the folder choice follow the active profile: stores the current one and restores the one saved for `profile`. */
  applyProfileFolders: (profile: string) => void
  showResult: (index: number) => void
  dismissError: () => void
  /** Starts a generation. `preview` makes a single unsaved image using the "Preview" preset, if the user has one. */
  generate: (options?: { preview?: boolean }) => void
  cancel: () => void
  toggleForever: () => void
  togglePreviews: () => Promise<void>
  /** Interrupts this session's generations, or everyone's when `all` is true. */
  interrupt: (all: boolean) => void
  /** Stops whatever is running and immediately starts a new generation with the current settings. */
  interruptAndGenerate: () => Promise<void>
}

/** Closes the active generation socket, if any. */
let closeSocket: (() => void) | null = null
/** Parameter overrides from the user's SwarmUI preset titled "Preview", used for live previews. */
let previewPreset: Record<string, unknown> = {}
/** The settings the last live preview was made with, to avoid repeating an identical one. */
let lastPreviewKey = ''
/** True while a run is being replaced on purpose, so "forever" does not also start one. */
let replacingRun = false

/** The settings that affect what a preview looks like, as one comparable string. */
function previewKey(s: Settings & Runtime): string {
  return JSON.stringify([s.prompt, s.negativePrompt, s.model, s.steps, s.cfgScale, s.seed, s.aspect, s.loras, s.initCreativity, !!s.initImage, s.maskImage?.length])
}

/** Describes the queue state in plain words. */
function describeStatus(status: GenStatus): string {
  if (status.loading_models > 0) {
    return 'Loading model…'
  }
  if (status.live_gens > 0) {
    return 'Generating…'
  }
  if (status.waiting_backends > 0) {
    return 'Waiting for the backend…'
  }
  return 'Queued…'
}

export const useStore = create<Settings & Runtime & Actions>()(
  persist(
    (set, get) => ({
      prompt: '',
      negativePrompt: '',
      model: null,
      side: 1024,
      steps: 20,
      cfgScale: 7,
      seed: -1,
      images: 1,
      aspect: '1:1',
      loras: [],
      initCreativity: 0.6,
      folder: '',
      customFolders: [],
      foldersProfile: '',
      savedFolders: {},

      initImage: null,
      initSize: null,
      maskImage: null,
      maskStrokes: [],
      running: false,
      cancelling: false,
      forever: false,
      previews: false,
      statusText: '',
      progress: 0,
      preview: null,
      results: [],
      current: 0,
      error: null,

      set: (patch) => set(patch),

      selectModel: (model) => {
        const patch: Partial<Settings> = {
          model: model.name,
          side: model.standard_width > 0 ? Math.max(model.standard_width, model.standard_height) : 1024,
        }
        // Distilled "turbo"-style models need few steps and no CFG; normal settings give them burnt images.
        const fast = /turbo|lightning|schnell|hyper|lcm/i.test(`${model.name} ${model.title || ''}`)
        const wasFast = get().cfgScale <= 1.5
        if (fast && !wasFast) {
          patch.steps = 8
          patch.cfgScale = 1
        }
        else if (!fast && wasFast) {
          patch.steps = 20
          patch.cfgScale = 7
        }
        set(patch)
      },

      toggleLora: (name, defaultWeight) => {
        const loras = get().loras
        if (loras.some((l) => l.name == name)) {
          set({ loras: loras.filter((l) => l.name != name) })
        }
        else {
          set({ loras: [...loras, { name, weight: defaultWeight }] })
        }
      },

      setLoraWeight: (name, weight) => {
        set({ loras: get().loras.map((l) => (l.name == name ? { ...l, weight } : l)) })
      },

      setInitImage: (dataUrl, width, height) => {
        // A new or removed starting image invalidates any painted mask.
        const patch: Partial<Settings & Runtime> = { initImage: dataUrl, initSize: null, maskImage: null, maskStrokes: [] }
        if (dataUrl && width && height) {
          patch.initSize = { width, height }
          patch.aspect = closestAspect(width, height)
        }
        set(patch)
      },

      setMask: (dataUrl, strokes) => set({ maskImage: dataUrl, maskStrokes: strokes }),

      startFromUrl: async (url) => {
        try {
          const blob = await (await fetch(url)).blob()
          const scaled = await fileToScaledDataUrl(blob)
          get().setInitImage(scaled.dataUrl, scaled.width, scaled.height)
          return true
        }
        catch {
          set({ error: 'Could not load that image as a starting image.' })
          return false
        }
      },

      applyProfileFolders: (profile) => {
        const s = get()
        if (s.foldersProfile == profile) {
          return
        }
        const savedFolders = { ...s.savedFolders, [s.foldersProfile]: { folder: s.folder, customFolders: s.customFolders } }
        const next = savedFolders[profile] || { folder: '', customFolders: [] }
        set({ savedFolders, foldersProfile: profile, folder: next.folder, customFolders: next.customFolders })
      },

      showResult: (index) => set({ current: index }),

      dismissError: () => set({ error: null }),

      generate: (options) => {
        const s = get()
        if (s.running || !s.model) {
          return
        }
        const isPreview = !!options?.preview
        const imageCount = isPreview ? 1 : s.images
        const [width, height] = sizeFor(s.aspect, s.side)
        const params: Record<string, unknown> = {
          images: imageCount,
          prompt: s.prompt,
          negativeprompt: s.negativePrompt,
          model: s.model,
          steps: s.steps,
          cfgscale: s.cfgScale,
          // Forever mode with a fixed seed would save the same image again and again, so it always randomises.
          seed: s.forever && !isPreview ? -1 : s.seed,
          aspectratio: s.aspect,
          width,
          height,
        }
        if (s.initImage) {
          params.initimage = s.initImage
          params.initimagecreativity = s.initCreativity
          if (s.maskImage) {
            params.maskimage = s.maskImage
            // Soften the mask edge so the repainted area blends into the rest.
            params.maskblur = 4
          }
        }
        if (s.folder && !isPreview) {
          // Save into the chosen folder, with the date and time in the file name so files sort by age.
          params.overrideoutpathformat = `${s.folder}/[year]-[month]-[day]-[hour][minute][request_time_inc]-[prompt]`
        }
        if (s.loras.length > 0) {
          params.loras = s.loras.map((l) => cleanModelName(l.name)).join(',')
          params.loraweights = s.loras.map((l) => l.weight).join(',')
        }
        if (isPreview) {
          lastPreviewKey = previewKey(s)
          Object.assign(params, previewPreset, { images: 1, donotsave: true })
        }
        const perImage: number[] = []
        let received = 0
        set({ running: true, cancelling: false, statusText: 'Starting…', progress: 0, preview: null, error: null })
        closeSocket = startGeneration(params, {
          onStatus: (status) => {
            if (!get().cancelling) {
              set({ statusText: describeStatus(status) })
            }
          },
          onProgress: (batchIndex, percent, preview) => {
            // Never move backwards: step progress resets to 0 between workflow stages.
            perImage[batchIndex] = Math.max(perImage[batchIndex] || 0, percent)
            let sum = 0
            for (let i = 0; i < imageCount; i++) {
              sum += perImage[i] || 0
            }
            const patch: Partial<Runtime> = { progress: sum / imageCount }
            if (preview) {
              patch.preview = preview
            }
            set(patch)
          },
          onImage: (image, metadata, batchIndex) => {
            perImage[batchIndex] = 1
            // A live preview replaces the previous live preview instead of piling up in the results strip.
            const earlier = get().results.filter((r) => !(isPreview && r.temp))
            set({ results: [{ src: image, metadata, temp: isPreview }, ...earlier], current: 0, preview: null })
            received++
            if (received >= imageCount) {
              // All images are in. SwarmUI takes a moment to close the socket itself, so finish now.
              closeSocket?.()
            }
          },
          onError: (message) => {
            // SwarmUI reports a user cancel as an error; that one is expected, so do not show it.
            if (!get().cancelling) {
              // Stop the automatic modes too, or a failing request would repeat endlessly.
              set({ error: message, forever: false, previews: false })
            }
            // SwarmUI leaves the socket open after an error, so close it to end the request.
            closeSocket?.()
          },
          onDone: () => {
            closeSocket = null
            set({ running: false, cancelling: false, statusText: '', progress: 0, preview: null })
            if (replacingRun) {
              return
            }
            const after = get()
            if (after.forever) {
              // Let the screen show the finished image for a moment before the next run starts.
              setTimeout(() => {
                if (get().forever) {
                  get().generate()
                }
              }, 150)
            }
            else if (after.previews && previewKey(after) != lastPreviewKey) {
              // Settings changed while this run was busy: make the preview that was skipped.
              get().generate({ preview: true })
            }
          },
        })
      },

      cancel: () => {
        if (!get().running) {
          return
        }
        // Cancelling also ends "forever", otherwise the next run would start straight away.
        set({ cancelling: true, forever: false, statusText: 'Cancelling…' })
        api('InterruptAll', { other_sessions: false }).catch(() => {
          // If the interrupt call itself fails, drop the connection so the screen does not stay stuck.
          closeSocket?.()
        })
      },

      toggleForever: () => {
        const forever = !get().forever
        set({ forever, previews: false })
        if (forever) {
          get().generate()
        }
      },

      togglePreviews: async () => {
        if (get().previews) {
          set({ previews: false })
          return
        }
        try {
          const data = await api<{ presets?: { title: string; param_map?: Record<string, unknown> }[] }>('GetMyUserData')
          previewPreset = data.presets?.find((p) => p.title == 'Preview')?.param_map || {}
        }
        catch {
          previewPreset = {}
        }
        lastPreviewKey = ''
        set({ previews: true, forever: false })
        get().generate({ preview: true })
      },

      interrupt: (all) => {
        set({ forever: false })
        if (get().running) {
          set({ cancelling: true, statusText: 'Cancelling…' })
        }
        api('InterruptAll', { other_sessions: all }).catch((err) => {
          closeSocket?.()
          set({ error: err instanceof Error ? err.message : String(err) })
        })
      },

      interruptAndGenerate: async () => {
        replacingRun = true
        closeSocket?.()
        try {
          await api('InterruptAll', { other_sessions: false })
        }
        catch {
          // Nothing was running, or the server is unreachable; the new generation reports that itself.
        }
        replacingRun = false
        get().generate()
      },
    }),
    {
      name: 'swarm-mobile-settings',
      version: 1,
      partialize: (s): Settings => ({
        prompt: s.prompt,
        negativePrompt: s.negativePrompt,
        model: s.model,
        side: s.side,
        steps: s.steps,
        cfgScale: s.cfgScale,
        seed: s.seed,
        images: s.images,
        aspect: s.aspect,
        loras: s.loras,
        initCreativity: s.initCreativity,
        folder: s.folder,
        customFolders: s.customFolders,
        foldersProfile: s.foldersProfile,
        savedFolders: s.savedFolders,
      }),
    },
  ),
)

/** Delay after the last change before a live preview is made, so typing does not fire one per keystroke. */
const PREVIEW_DELAY_MS = 700
let previewTimer: ReturnType<typeof setTimeout> | undefined

useStore.subscribe((state) => {
  if (!state.previews || state.running || previewKey(state) == lastPreviewKey) {
    return
  }
  clearTimeout(previewTimer)
  previewTimer = setTimeout(() => {
    const now = useStore.getState()
    if (now.previews && !now.running && previewKey(now) != lastPreviewKey) {
      now.generate({ preview: true })
    }
  }, PREVIEW_DELAY_MS)
})
