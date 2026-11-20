import { useEffect, useState } from 'react'
import { useModels } from '@/models-store'
import { useProfiles } from '@/profiles-store'
import { GalleryScreen } from '@/screens/GalleryScreen'
import { GenerateScreen } from '@/screens/GenerateScreen'

/** Which screen the URL's hash selects. Using the hash makes the phone's Back button return from the gallery. */
function screenFromHash(): 'generate' | 'gallery' {
  return location.hash == '#gallery' ? 'gallery' : 'generate'
}

/** App root. Loads the model lists once and switches between the Generate and Gallery screens. */
export default function App() {
  const load = useModels((s) => s.load)
  const [screen, setScreen] = useState(screenFromHash)

  const loadProfiles = useProfiles((s) => s.load)

  useEffect(() => {
    load()
    loadProfiles()
  }, [load, loadProfiles])

  useEffect(() => {
    const onHashChange = () => setScreen(screenFromHash())
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  if (screen == 'gallery') {
    return (
      <GalleryScreen
        onBack={() => {
          // Go back in history when the gallery was opened from Generate, so Back does not loop between the two.
          if (history.length > 1) {
            history.back()
          }
          else {
            location.hash = ''
          }
        }}
      />
    )
  }
  return <GenerateScreen onOpenGallery={() => (location.hash = '#gallery')} />
}
