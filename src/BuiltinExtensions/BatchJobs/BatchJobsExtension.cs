using FreneticUtilities.FreneticExtensions;
using Newtonsoft.Json.Linq;
using SwarmUI.Accounts;
using SwarmUI.Core;
using SwarmUI.Text2Image;
using SwarmUI.Utils;
using SwarmUI.WebAPI;
using System.Collections.Concurrent;

namespace SwarmUI.Builtin_BatchJobsExtension;

/// <summary>Pure helpers for batch job limits and input clean-up, kept separate so they can be unit tested.</summary>
public static class BatchJobRules
{
    /// <summary>Most images one batch may ask for.</summary>
    public const int MaxImagesPerBatch = 500;

    /// <summary>Most batches one user may have waiting or running at once.</summary>
    public const int MaxActiveJobsPerUser = 10;

    /// <summary>How many failed images in a row end a batch, so one bad setting cannot produce hundreds of errors.</summary>
    public const int MaxConsecutiveFailures = 3;

    /// <summary>How many of a job's most recent image paths are kept for display.</summary>
    public const int RecentImagesKept = 8;

    /// <summary>Keys removed from a batch's input: the session belongs to the caller, and the rest would change how many images one request makes or stop them being saved.</summary>
    public static readonly string[] StrippedKeys = ["session_id", "count", "images", "batchsize", "seed", "donotsave"];

    /// <summary>Returns whether a requested image count is allowed.</summary>
    public static bool IsValidCount(int count)
    {
        return count >= 1 && count <= MaxImagesPerBatch;
    }

    /// <summary>
    /// Builds the input used for every image of a batch from what the client sent.
    /// The result always asks for exactly one image with a random seed, whatever "images per run" or batch size the client had set,
    /// so a batch of N is N images.
    /// </summary>
    public static JObject PrepareInput(JObject rawInput)
    {
        JObject input = (JObject)rawInput.DeepClone();
        foreach (string key in StrippedKeys)
        {
            input.Remove(key);
        }
        input["images"] = 1;
        input["seed"] = -1;
        return input;
    }

    /// <summary>Key in an image's extra metadata that records which batch made it.</summary>
    public const string BatchIdMetadataKey = "batch_id";

    /// <summary>Marks a batch's input so every image it makes records the batch ID in its metadata, keeping any extra metadata the client sent.</summary>
    public static void StampBatchId(JObject input, string batchId)
    {
        if (input["extra_metadata"] is not JObject extra)
        {
            extra = [];
            input["extra_metadata"] = extra;
        }
        extra[BatchIdMetadataKey] = batchId;
    }

    /// <summary>
    /// Returns the top-level output folder an output path format saves into, eg "Portraits" for "Portraits/[year]-[prompt]".
    /// Returns an empty string when the first part is not a fixed name.
    /// </summary>
    public static string TopFolderOf(string outPathFormat)
    {
        string first = (outPathFormat ?? "").Replace('\\', '/').TrimStart('/').Before('/');
        return first.Contains('[') || !(outPathFormat ?? "").Contains('/') ? "" : first;
    }

    /// <summary>Returns a short single-line description of a prompt, for listing a job.</summary>
    public static string Summarize(string prompt, int maxLength = 80)
    {
        string cleaned = (prompt ?? "").Replace('\n', ' ').Replace('\r', ' ').Trim();
        return cleaned.Length <= maxLength ? cleaned : cleaned[..maxLength] + "...";
    }
}

/// <summary>One batch: a number of images to generate in the background with the same settings and a new random seed each.</summary>
public class BatchJob
{
    /// <summary>Unique ID of this job.</summary>
    public string ID;

    /// <summary>ID of the user that owns this job.</summary>
    public string UserID;

    /// <summary>How many images were asked for.</summary>
    public int Total;

    /// <summary>How many images have been generated and saved so far.</summary>
    public int Done;

    /// <summary>How many image attempts failed.</summary>
    public int Failed;

    /// <summary>One of: queued, running, finished, cancelled, failed.</summary>
    public volatile string State = "queued";

    /// <summary>The input used for each image, already cleaned by <see cref="BatchJobRules.PrepareInput"/>.</summary>
    public JObject Input;

    /// <summary>Short form of the prompt, for display.</summary>
    public string Prompt;

    /// <summary>The whole prompt exactly as the user wrote it, so it can be copied back out.</summary>
    public string FullPrompt;

    /// <summary>The top-level output folder the batch saves into, or an empty string if it is not a fixed folder.</summary>
    public string Folder;

    /// <summary>Name of the model, for display.</summary>
    public string Model;

    /// <summary>Unix time (seconds) the job was created, started, and ended. Zero when not yet reached.</summary>
    public long CreatedTime, StartedTime, EndedTime;

    /// <summary>Paths (as returned to clients, eg "View/user/raw/x.png") of the most recently finished images, newest first.</summary>
    public List<string> RecentImages = [];

    /// <summary>The most recent error message, if any.</summary>
    public string LastError;

    /// <summary>Progress of the image currently being generated, from 0 to 1.</summary>
    public double CurrentProgress;

    /// <summary>Set when the owner asks for the job to stop.</summary>
    public volatile bool CancelRequested;

    /// <summary>The session the job generates under while it runs. Null when not running.</summary>
    public Session RunSession;

    /// <summary>Whether the job has reached an end state.</summary>
    public bool IsEnded => State is "finished" or "cancelled" or "failed";

    /// <summary>Describes the job for API responses.</summary>
    public JObject ToNetObject()
    {
        lock (this)
        {
            return new JObject()
            {
                ["id"] = ID,
                ["state"] = State,
                ["total"] = Total,
                ["done"] = Done,
                ["failed"] = Failed,
                ["prompt"] = Prompt,
                ["full_prompt"] = FullPrompt,
                ["folder"] = Folder,
                ["model"] = Model,
                ["created"] = CreatedTime,
                ["started"] = StartedTime,
                ["ended"] = EndedTime,
                ["recent_images"] = JArray.FromObject(RecentImages),
                ["error"] = LastError,
                ["current_progress"] = CurrentProgress
            };
        }
    }
}

/// <summary>
/// Extension that adds background batch jobs: generate a number of images on the server with nobody connected.
/// Jobs are held in memory only, so they end if the server restarts. Each user has their own queue, worked through one job at a time.
/// </summary>
public class BatchJobsExtension : Extension
{
    /// <summary>How long an ended job stays listed before it is forgotten.</summary>
    public static TimeSpan EndedJobLifetime = TimeSpan.FromHours(24);

    /// <summary>All known jobs per user ID, oldest first. Lock the list when reading or changing it.</summary>
    public static ConcurrentDictionary<string, List<BatchJob>> JobsByUser = new();

    /// <summary>User IDs that currently have a runner task working through their queue.</summary>
    public static ConcurrentDictionary<string, bool> ActiveRunners = new();

    /// <inheritdoc/>
    public override void OnInit()
    {
        API.RegisterAPICall(BatchJobStart, true, Permissions.BasicImageGeneration);
        API.RegisterAPICall(BatchJobList, false, Permissions.BasicImageGeneration);
        API.RegisterAPICall(BatchJobCancel, true, Permissions.BasicImageGeneration);
        API.RegisterAPICall(BatchJobDismiss, true, Permissions.BasicImageGeneration);
    }

    /// <inheritdoc/>
    public override void OnShutdown()
    {
        foreach (List<BatchJob> jobs in JobsByUser.Values)
        {
            lock (jobs)
            {
                foreach (BatchJob job in jobs)
                {
                    job.CancelRequested = true;
                }
            }
        }
    }

    /// <summary>Current unix time in seconds.</summary>
    public static long Now => DateTimeOffset.UtcNow.ToUnixTimeSeconds();

    /// <summary>Returns the job list for a user, dropping ended jobs that are older than <see cref="EndedJobLifetime"/>.</summary>
    public static List<BatchJob> GetJobs(string userId)
    {
        List<BatchJob> jobs = JobsByUser.GetOrAdd(userId, _ => []);
        long cutoff = Now - (long)EndedJobLifetime.TotalSeconds;
        lock (jobs)
        {
            jobs.RemoveAll(j => j.IsEnded && j.EndedTime < cutoff);
        }
        return jobs;
    }

    /// <summary>Starts a runner for the user's queue if one is not already going.</summary>
    public static void EnsureRunner(string userId)
    {
        if (!ActiveRunners.TryAdd(userId, true))
        {
            return;
        }
        Utilities.RunCheckedTask(async () =>
        {
            try
            {
                while (true)
                {
                    BatchJob next;
                    List<BatchJob> jobs = GetJobs(userId);
                    lock (jobs)
                    {
                        next = jobs.FirstOrDefault(j => j.State == "queued");
                    }
                    if (next is null)
                    {
                        break;
                    }
                    await RunJob(next);
                }
            }
            finally
            {
                ActiveRunners.TryRemove(userId, out _);
            }
            // A job may have been queued in the moment between the last check and the runner being released.
            List<BatchJob> remaining = GetJobs(userId);
            bool anyQueued;
            lock (remaining)
            {
                anyQueued = remaining.Any(j => j.State == "queued");
            }
            if (anyQueued)
            {
                EnsureRunner(userId);
            }
        });
    }

    /// <summary>Marks a job as ended.</summary>
    public static void EndJob(BatchJob job, string state, string error = null)
    {
        lock (job)
        {
            job.State = state;
            job.EndedTime = Now;
            job.CurrentProgress = 0;
            job.LastError = error ?? job.LastError;
        }
        Logs.Info($"Batch job {job.ID} for user '{job.UserID}' {state}: {job.Done} of {job.Total} images made, {job.Failed} failed.");
    }

    /// <summary>Generates a job's images one at a time until it is done, cancelled, or failing repeatedly.</summary>
    public static async Task RunJob(BatchJob job)
    {
        if (job.CancelRequested)
        {
            EndJob(job, "cancelled");
            return;
        }
        User user = Program.Sessions.GetUser(job.UserID, false);
        if (user is null || !user.MayCreateSessions)
        {
            EndJob(job, "cancelled", "The account this batch belonged to no longer exists.");
            return;
        }
        Session session;
        try
        {
            // The job has its own session, so interrupting the phone's current session does not stop it, while "interrupt all sessions" does.
            session = Program.Sessions.CreateSession($"batch job {job.ID}", user.UserID, false);
        }
        catch (Exception ex)
        {
            EndJob(job, "failed", $"Could not start: {ex.Message}");
            return;
        }
        lock (job)
        {
            job.RunSession = session;
            job.State = "running";
            job.StartedTime = Now;
        }
        Logs.Info($"Batch job {job.ID} for user '{job.UserID}' starting: {job.Total} images.");
        int consecutiveFailures = 0;
        string endState = "finished";
        string endError = null;
        try
        {
            for (int i = job.Done; i < job.Total; i++)
            {
                if (job.CancelRequested || Program.GlobalProgramCancel.IsCancellationRequested)
                {
                    endState = "cancelled";
                    break;
                }
                if (!user.MayCreateSessions)
                {
                    endState = "cancelled";
                    endError = "The account this batch belonged to was removed.";
                    break;
                }
                session.UpdateLastUsedTime();
                // Interrupting a session swaps in a new token, so hold on to this image's token to tell afterwards whether it was interrupted.
                CancellationToken interruptToken = session.SessInterrupt.Token;
                bool gotImage = false;
                string error = null;
                void output(JObject data)
                {
                    if (data.TryGetValue("image", out JToken image) && image.Type == JTokenType.String)
                    {
                        gotImage = true;
                        lock (job)
                        {
                            job.Done++;
                            job.CurrentProgress = 0;
                            job.RecentImages.Insert(0, image.ToString());
                            if (job.RecentImages.Count > BatchJobRules.RecentImagesKept)
                            {
                                job.RecentImages.RemoveAt(job.RecentImages.Count - 1);
                            }
                        }
                    }
                    else if (data.TryGetValue("error", out JToken err))
                    {
                        error = err.ToString();
                    }
                    else if (data.TryGetValue("gen_progress", out JToken progress) && progress is JObject progressObj)
                    {
                        double current = progressObj.Value<double?>("current_percent") ?? 0;
                        if (current > 0)
                        {
                            job.CurrentProgress = current;
                        }
                    }
                }
                try
                {
                    await T2IAPI.GenT2I_Internal(session, (1, (JObject)job.Input.DeepClone(), new T2IAPI.SharedGenT2IData(), i), output, true);
                }
                catch (Exception ex)
                {
                    error = ex is SwarmReadableErrorException ? ex.Message : $"Internal error: {ex.Message}";
                    Logs.Error($"Batch job {job.ID} image {i + 1} threw: {ex.ReadableString()}");
                }
                if (interruptToken.IsCancellationRequested || job.CancelRequested)
                {
                    endState = "cancelled";
                    break;
                }
                if (gotImage)
                {
                    consecutiveFailures = 0;
                    continue;
                }
                lock (job)
                {
                    job.Failed++;
                    job.LastError = error ?? "No image was produced.";
                }
                consecutiveFailures++;
                if (consecutiveFailures >= BatchJobRules.MaxConsecutiveFailures)
                {
                    endState = "failed";
                    endError = $"Stopped after {consecutiveFailures} failed images in a row. Last error: {job.LastError}";
                    break;
                }
                // A failed attempt does not count towards the total: try this image again.
                i--;
            }
        }
        finally
        {
            lock (job)
            {
                job.RunSession = null;
            }
            try
            {
                Program.Sessions.RemoveSession(session);
            }
            catch (Exception ex)
            {
                Logs.Debug($"Failed to remove batch job session: {ex.ReadableString()}");
            }
        }
        EndJob(job, endState, endError);
    }

    [API.APIDescription("Starts a background batch: the given number of images, each with a new random seed, generated on the server even if the client disconnects. Queues behind any batch the user already has running.",
        """
            "success": true,
            "id": "job-id"
        """)]
    public static async Task<JObject> BatchJobStart(Session session,
        [API.APIParameter("How many images to generate in total.")] int count,
        [API.APIParameter("Raw mapping of input, the same T2I parameters as GenerateText2Image. 'images', 'batchsize' and 'seed' are ignored: every image is a single image with a random seed.")] JObject rawInput)
    {
        if (!BatchJobRules.IsValidCount(count))
        {
            return new JObject() { ["error"] = $"A batch must be between 1 and {BatchJobRules.MaxImagesPerBatch} images." };
        }
        JObject input = BatchJobRules.PrepareInput(rawInput);
        string prompt, model, outPathFormat;
        try
        {
            // Check the settings now, so a bad model or parameter is reported straight away rather than as failed images later.
            T2IParamInput parsed = T2IAPI.RequestToParams(session, (JObject)input.DeepClone());
            prompt = parsed.Get(T2IParamTypes.Prompt, "");
            model = parsed.Get(T2IParamTypes.Model)?.Name ?? "";
            outPathFormat = parsed.Get(T2IParamTypes.OverrideOutpathFormat, session.User.Settings.OutPathBuilder.Format);
        }
        catch (SwarmReadableErrorException ex)
        {
            return new JObject() { ["error"] = ex.Message };
        }
        if (string.IsNullOrWhiteSpace(model))
        {
            return new JObject() { ["error"] = "No model is selected." };
        }
        List<BatchJob> jobs = GetJobs(session.User.UserID);
        BatchJob job = new()
        {
            ID = Utilities.SecureRandomHex(12),
            UserID = session.User.UserID,
            Total = count,
            Input = input,
            Prompt = BatchJobRules.Summarize(prompt),
            FullPrompt = rawInput.Value<string>("prompt") ?? prompt,
            Folder = BatchJobRules.TopFolderOf(outPathFormat),
            Model = model,
            CreatedTime = Now
        };
        BatchJobRules.StampBatchId(job.Input, job.ID);
        lock (jobs)
        {
            if (jobs.Count(j => !j.IsEnded) >= BatchJobRules.MaxActiveJobsPerUser)
            {
                return new JObject() { ["error"] = $"You already have {BatchJobRules.MaxActiveJobsPerUser} batches waiting. Cancel one or let some finish first." };
            }
            jobs.Add(job);
        }
        Logs.Info($"User '{session.User.UserID}' queued batch job {job.ID}: {count} images with model '{model}'.");
        EnsureRunner(session.User.UserID);
        return new JObject() { ["success"] = true, ["id"] = job.ID };
    }

    [API.APIDescription("Lists the calling user's batch jobs: queued, running, and recently ended.",
        """
            "jobs":
            [
                {
                    "id": "job-id",
                    "state": "running", // or "queued", "finished", "cancelled", "failed"
                    "total": 50,
                    "done": 12,
                    "failed": 0,
                    "prompt": "start of the prompt...",
                    "full_prompt": "the whole prompt as written",
                    "folder": "Portraits", // top-level output folder, or "" if not a fixed one
                    "model": "model name",
                    "created": 1700000000,
                    "started": 1700000000,
                    "ended": 0,
                    "recent_images": ["View/user/raw/x.png"],
                    "error": null,
                    "current_progress": 0.5
                }
            ]
        """)]
    public static async Task<JObject> BatchJobList(Session session)
    {
        List<BatchJob> jobs = GetJobs(session.User.UserID);
        JArray result;
        lock (jobs)
        {
            result = [.. jobs.Select(j => j.ToNetObject())];
        }
        return new JObject() { ["jobs"] = result };
    }

    /// <summary>Finds one of the user's jobs by ID, or returns null.</summary>
    public static BatchJob FindJob(Session session, string id)
    {
        List<BatchJob> jobs = GetJobs(session.User.UserID);
        lock (jobs)
        {
            return jobs.FirstOrDefault(j => j.ID == id);
        }
    }

    [API.APIDescription("Cancels one of the calling user's batch jobs. Images already generated are kept.",
        """
            "success": true
        """)]
    public static async Task<JObject> BatchJobCancel(Session session,
        [API.APIParameter("ID of the job to cancel.")] string id)
    {
        BatchJob job = FindJob(session, id);
        if (job is null)
        {
            return new JObject() { ["error"] = "There is no such batch.", ["error_id"] = "no_such_job" };
        }
        Session running;
        lock (job)
        {
            if (job.IsEnded)
            {
                return new JObject() { ["success"] = true };
            }
            job.CancelRequested = true;
            running = job.RunSession;
            if (job.State == "queued")
            {
                job.State = "cancelled";
                job.EndedTime = Now;
            }
        }
        // Stop the image in progress too, rather than waiting for it to finish.
        running?.Interrupt();
        return new JObject() { ["success"] = true };
    }

    [API.APIDescription("Removes an ended batch job from the calling user's list.",
        """
            "success": true
        """)]
    public static async Task<JObject> BatchJobDismiss(Session session,
        [API.APIParameter("ID of the job to remove from the list.")] string id)
    {
        List<BatchJob> jobs = GetJobs(session.User.UserID);
        lock (jobs)
        {
            BatchJob job = jobs.FirstOrDefault(j => j.ID == id);
            if (job is null)
            {
                return new JObject() { ["error"] = "There is no such batch.", ["error_id"] = "no_such_job" };
            }
            if (!job.IsEnded)
            {
                return new JObject() { ["error"] = "That batch is still going. Cancel it first." };
            }
            jobs.Remove(job);
        }
        return new JObject() { ["success"] = true };
    }
}
