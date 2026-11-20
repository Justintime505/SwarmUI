using NUnit.Framework;
using System.Linq;
using SwarmUI.Builtin_ModelTagsExtension;

namespace SwarmUITests;

/// <summary>Tests the tag clean-up rules of the ModelTags extension.</summary>
[TestFixture]
public class ModelTagRulesTests : SwarmUITest
{
    /// <summary>Prepares the basics.</summary>
    [OneTimeSetUp]
    public static void PreInit()
    {
        Setup();
    }

    /// <summary>Tag text is tidied into a comma-separated list: trimmed, with empty tags dropped and line breaks treated as commas.</summary>
    [TestCase(null, "")]
    [TestCase("", "")]
    [TestCase("   ", "")]
    [TestCase("masterpiece", "masterpiece")]
    [TestCase("  masterpiece ,best quality,, very aesthetic , ", "masterpiece, best quality, very aesthetic")]
    [TestCase("bad quality\nworst quality\r\nsketch", "bad quality, worst quality, sketch")]
    [TestCase("<lora:x:1>, (tag:1.2)", "<lora:x:1>, (tag:1.2)")]
    public void Clean(string input, string expected)
    {
        Assert.That(ModelTagRules.Clean(input), Is.EqualTo(expected));
    }

    /// <summary>Overlong tag text is cut at a tag boundary, never mid-tag.</summary>
    [Test]
    public void CleanCutsAtATagBoundary()
    {
        string longText = string.Join(", ", Enumerable.Repeat("some tag", 400));
        string cleaned = ModelTagRules.Clean(longText);
        Assert.That(cleaned.Length, Is.LessThanOrEqualTo(ModelTagRules.MaxLength));
        Assert.That(cleaned, Does.EndWith("some tag"));
        Assert.That(cleaned.Split(", "), Is.All.EqualTo("some tag"));
    }

    /// <summary>Only main models and LoRAs can have tags.</summary>
    [TestCase("Stable-Diffusion", true)]
    [TestCase("LoRA", true)]
    [TestCase("VAE", false)]
    [TestCase("lora", false)]
    [TestCase("", false)]
    [TestCase(null, false)]
    public void AllowedSubtypes(string subtype, bool expected)
    {
        Assert.That(ModelTagRules.IsAllowedSubtype(subtype), Is.EqualTo(expected));
    }
}
