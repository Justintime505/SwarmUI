using FreneticUtilities.FreneticExtensions;
using Newtonsoft.Json.Linq;
using SwarmUI.Accounts;
using SwarmUI.Core;
using SwarmUI.Text2Image;
using SwarmUI.Utils;
using SwarmUI.WebAPI;

namespace SwarmUI.Builtin_ModelTagsExtension;

/// <summary>Pure helpers for model tags, kept separate so they can be unit tested.</summary>
public static class ModelTagRules
{
    /// <summary>Longest allowed tag text for one model, in characters.</summary>
    public const int MaxLength = 2000;

    /// <summary>The model kinds that can have tags.</summary>
    public static readonly string[] AllowedSubtypes = ["Stable-Diffusion", "LoRA"];

    /// <summary>Returns whether the model kind can have tags.</summary>
    public static bool IsAllowedSubtype(string subtype)
    {
        return subtype is not null && AllowedSubtypes.Contains(subtype);
    }

    /// <summary>
    /// Tidies tag text typed by a user: line breaks become commas, each tag is trimmed, empty tags are dropped,
    /// and the result is cut to <see cref="MaxLength"/>. Null becomes an empty string.
    /// </summary>
    public static string Clean(string text)
    {
        if (string.IsNullOrWhiteSpace(text))
        {
            return "";
        }
        string[] parts = text.Replace('\r', '\n').Replace('\n', ',').Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries);
        string joined = parts.JoinString(", ");
        if (joined.Length > MaxLength)
        {
            joined = joined[..MaxLength].BeforeLast(',').Trim();
        }
        return joined;
    }

    /// <summary>The name a model's negative tags are stored under.</summary>
    public static string StorageName(string subtype, string model)
    {
        return $"{subtype}/{model}";
    }
}

/// <summary>
/// Extension that lets each model and LoRA remember tags to add to prompts.
/// Positive tags are the model's own "trigger phrase" metadata, so the <c>&lt;trigger&gt;</c> prompt syntax uses them too.
/// Negative tags have no place in model metadata, so they are kept in the user's saved data, which profiles share with the local user.
/// Clients read the tags and add them to the prompt themselves.
/// </summary>
public class ModelTagsExtension : Extension
{
    /// <summary>The saved-data category that holds negative tags.</summary>
    public const string NegativeDataName = "modeltags_negative";

    /// <inheritdoc/>
    public override void OnInit()
    {
        API.RegisterAPICall(ModelTagsList, false, Permissions.FundamentalModelAccess);
        API.RegisterAPICall(ModelTagsSet, true, Permissions.EditModelMetadata);
    }

    [API.APIDescription("Lists the negative tags remembered for models and LoRAs. Positive tags are each model's `trigger_phrase` in ListModels.",
        """
            "negatives":
            {
                "Stable-Diffusion": { "model/name.safetensors": "bad quality, sketch" },
                "LoRA": { }
            }
        """)]
    public static async Task<JObject> ModelTagsList(Session session)
    {
        JObject negatives = [];
        foreach (string subtype in ModelTagRules.AllowedSubtypes)
        {
            negatives[subtype] = new JObject();
        }
        foreach (SessionHandler.GenericDataStore stored in session.User.GetAllGenericData(NegativeDataName))
        {
            try
            {
                JObject entry = JObject.Parse(stored.Data);
                string subtype = entry.Value<string>("subtype");
                string model = entry.Value<string>("model");
                string negative = entry.Value<string>("negative");
                if (ModelTagRules.IsAllowedSubtype(subtype) && !string.IsNullOrWhiteSpace(model) && !string.IsNullOrWhiteSpace(negative) && session.User.IsAllowedModel(model))
                {
                    negatives[subtype][model] = negative;
                }
            }
            catch (Exception ex)
            {
                Logs.Warning($"Ignoring unreadable model tags entry '{stored.ID}': {ex.Message}");
            }
        }
        return new JObject() { ["negatives"] = negatives };
    }

    [API.APIDescription("Sets the tags remembered for a model or LoRA. The positive tags are saved as the model's trigger phrase.",
        """
            "success": true,
            "positive": "masterpiece, best quality", // as saved, after tidying
            "negative": "bad quality"
        """)]
    public static async Task<JObject> ModelTagsSet(Session session,
        [API.APIParameter("Exact filepath name of the model.")] string model,
        [API.APIParameter("The model's sub-type: `Stable-Diffusion` or `LoRA`.")] string subtype = "Stable-Diffusion",
        [API.APIParameter("Tags to add to the prompt when this model is used. Empty for none.")] string positive = "",
        [API.APIParameter("Tags to add to the negative prompt when this model is used. Empty for none.")] string negative = "")
    {
        if (!ModelTagRules.IsAllowedSubtype(subtype) || !Program.T2IModelSets.TryGetValue(subtype, out T2IModelHandler handler))
        {
            return new JObject() { ["error"] = "Invalid sub-type." };
        }
        if (ModelsAPI.TryGetRefusalForModel(session, model, out JObject refusal))
        {
            return refusal;
        }
        if (!handler.Models.TryGetValue(model, out T2IModel actualModel))
        {
            return new JObject() { ["error"] = "Model not found." };
        }
        positive = ModelTagRules.Clean(positive);
        negative = ModelTagRules.Clean(negative);
        T2IModelHandler.ModelMetadataStore meta = actualModel.Metadata;
        if (positive != (meta?.TriggerPhrase ?? "").Trim())
        {
            // Saving rewrites the model's metadata, so only do it when the trigger phrase really changed. Every other value is passed back unchanged.
            JObject result = await ModelsAPI.EditModelMetadata(session, model, actualModel.Title, meta?.Author, "", actualModel.Description, 0, 0,
                meta?.UsageHint, meta?.Date, meta?.License, positive, meta?.PredictionType, meta?.Tags is null ? "" : meta.Tags.JoinString(","),
                null, null, meta?.IsNegativeEmbedding ?? false, meta?.LoraDefaultWeight ?? "", meta?.LoraDefaultConfinement ?? "", subtype);
            if (result.ContainsKey("error"))
            {
                return result;
            }
        }
        string storageName = ModelTagRules.StorageName(subtype, model);
        if (negative == "")
        {
            session.User.DeleteGenericData(NegativeDataName, storageName);
        }
        else
        {
            session.User.SaveGenericData(NegativeDataName, storageName, new JObject() { ["subtype"] = subtype, ["model"] = model, ["negative"] = negative }.ToString(Newtonsoft.Json.Formatting.None));
        }
        return new JObject() { ["success"] = true, ["positive"] = positive, ["negative"] = negative };
    }
}
