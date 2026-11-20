using Newtonsoft.Json.Linq;
using NUnit.Framework;
using SwarmUI.Builtin_BatchJobsExtension;

namespace SwarmUITests;

/// <summary>Tests the limits and input clean-up of the BatchJobs extension.</summary>
[TestFixture]
public class BatchJobRulesTests : SwarmUITest
{
    /// <summary>Prepares the basics.</summary>
    [OneTimeSetUp]
    public static void PreInit()
    {
        Setup();
    }

    /// <summary>A batch is between 1 and the maximum number of images.</summary>
    [TestCase(1, true)]
    [TestCase(50, true)]
    [TestCase(500, true)]
    [TestCase(0, false)]
    [TestCase(-5, false)]
    [TestCase(501, false)]
    public void CountValidity(int count, bool expected)
    {
        Assert.That(BatchJobRules.IsValidCount(count), Is.EqualTo(expected));
    }

    /// <summary>
    /// Whatever "images per run" or batch size the client sends, each request of a batch must make exactly one image,
    /// so a batch of 50 is 50 images and never 50 runs of 4.
    /// </summary>
    [Test]
    public void EachRequestIsOneImage()
    {
        JObject sent = new() { ["prompt"] = "a cat", ["images"] = 4, ["batchsize"] = 3, ["count"] = 50 };
        JObject input = BatchJobRules.PrepareInput(sent);
        Assert.That(input.Value<int>("images"), Is.EqualTo(1));
        Assert.That(input.ContainsKey("batchsize"), Is.False);
        Assert.That(input.ContainsKey("count"), Is.False);
    }

    /// <summary>A fixed seed from the client is replaced, so every image of a batch gets a new random seed.</summary>
    [Test]
    public void SeedIsAlwaysRandom()
    {
        JObject input = BatchJobRules.PrepareInput(new JObject() { ["prompt"] = "a cat", ["seed"] = 12345 });
        Assert.That(input.Value<long>("seed"), Is.EqualTo(-1));
    }

    /// <summary>Batch images must be saved, and must not carry the caller's session ID around.</summary>
    [Test]
    public void SessionAndDoNotSaveAreRemoved()
    {
        JObject input = BatchJobRules.PrepareInput(new JObject() { ["session_id"] = "abc", ["donotsave"] = true, ["prompt"] = "a cat" });
        Assert.That(input.ContainsKey("session_id"), Is.False);
        Assert.That(input.ContainsKey("donotsave"), Is.False);
    }

    /// <summary>Everything else the client sent is kept, and the client's object is not modified.</summary>
    [Test]
    public void OtherSettingsAreKeptAndOriginalUntouched()
    {
        JObject sent = new() { ["prompt"] = "a cat", ["model"] = "m", ["steps"] = 8, ["loras"] = "x", ["images"] = 4 };
        JObject input = BatchJobRules.PrepareInput(sent);
        Assert.That(input.Value<string>("prompt"), Is.EqualTo("a cat"));
        Assert.That(input.Value<string>("model"), Is.EqualTo("m"));
        Assert.That(input.Value<int>("steps"), Is.EqualTo(8));
        Assert.That(input.Value<string>("loras"), Is.EqualTo("x"));
        Assert.That(sent.Value<int>("images"), Is.EqualTo(4));
    }

    /// <summary>Every image of a batch records the batch ID, without losing extra metadata the client sent.</summary>
    [Test]
    public void BatchIdIsStampedIntoMetadata()
    {
        JObject plain = BatchJobRules.PrepareInput(new JObject() { ["prompt"] = "a cat" });
        BatchJobRules.StampBatchId(plain, "abc123");
        Assert.That(plain["extra_metadata"].Value<string>(BatchJobRules.BatchIdMetadataKey), Is.EqualTo("abc123"));
        JObject withExtra = BatchJobRules.PrepareInput(new JObject() { ["prompt"] = "a cat", ["extra_metadata"] = new JObject() { ["note"] = "keep me" } });
        BatchJobRules.StampBatchId(withExtra, "abc123");
        Assert.That(withExtra["extra_metadata"].Value<string>("note"), Is.EqualTo("keep me"));
        Assert.That(withExtra["extra_metadata"].Value<string>(BatchJobRules.BatchIdMetadataKey), Is.EqualTo("abc123"));
    }

    /// <summary>The output folder is the fixed first part of the path format, when there is one.</summary>
    [TestCase("Portraits/[year]-[month]-[day]-[prompt]", "Portraits")]
    [TestCase("raw/[year]-[month]-[day]/[hour][minute]-[prompt]", "raw")]
    [TestCase("[year]/[prompt]", "")]
    [TestCase("[prompt]", "")]
    [TestCase("justafilename", "")]
    [TestCase(null, "")]
    public void TopFolderOfPathFormat(string format, string expected)
    {
        Assert.That(BatchJobRules.TopFolderOf(format), Is.EqualTo(expected));
    }

    /// <summary>Prompt summaries are single-line and capped in length.</summary>
    [Test]
    public void SummariesAreShortAndSingleLine()
    {
        Assert.That(BatchJobRules.Summarize("a cat\non a mat"), Is.EqualTo("a cat on a mat"));
        Assert.That(BatchJobRules.Summarize(null), Is.EqualTo(""));
        Assert.That(BatchJobRules.Summarize(new string('x', 200), 80), Has.Length.EqualTo(83));
    }
}
