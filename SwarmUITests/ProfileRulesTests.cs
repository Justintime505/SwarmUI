using NUnit.Framework;
using SwarmUI.Builtin_ProfilesExtension;

namespace SwarmUITests;

/// <summary>Tests the name and PIN rules of the Profiles extension.</summary>
[TestFixture]
public class ProfileRulesTests : SwarmUITest
{
    /// <summary>Prepares the basics.</summary>
    [OneTimeSetUp]
    public static void PreInit()
    {
        Setup();
    }

    /// <summary>An empty PIN means "no PIN" and is allowed; otherwise a PIN is 4 to 8 digits.</summary>
    [TestCase("", true)]
    [TestCase("1234", true)]
    [TestCase("12345678", true)]
    [TestCase("0000", true)]
    [TestCase("123", false)]
    [TestCase("123456789", false)]
    [TestCase("12a4", false)]
    [TestCase("12 4", false)]
    [TestCase("١٢٣٤", false)]
    public void PinValidity(string pin, bool expected)
    {
        Assert.That(ProfileRules.IsValidPin(pin), Is.EqualTo(expected));
    }

    /// <summary>A missing PIN value is rejected rather than treated as "no PIN".</summary>
    [Test]
    public void NullPinIsInvalid()
    {
        Assert.That(ProfileRules.IsValidPin(null), Is.False);
    }

    /// <summary>The stored form of a PIN must always clear the account system's 8-character password minimum, including for "no PIN".</summary>
    [TestCase("")]
    [TestCase("1234")]
    [TestCase("12345678")]
    public void WrappedPinMeetsPasswordMinimum(string pin)
    {
        Assert.That(ProfileRules.WrapPin(pin), Has.Length.GreaterThanOrEqualTo(8));
    }

    /// <summary>Different PINs must wrap to different stored text, and "no PIN" must differ from every real PIN.</summary>
    [Test]
    public void WrappedPinsAreDistinct()
    {
        Assert.That(ProfileRules.WrapPin("1234"), Is.Not.EqualTo(ProfileRules.WrapPin("12345")));
        Assert.That(ProfileRules.WrapPin(""), Is.Not.EqualTo(ProfileRules.WrapPin("0000")));
    }

    /// <summary>Names are lowercased and stripped to letters, digits and underscore.</summary>
    [TestCase("Justin", "justin")]
    [TestCase("  Kid One! ", "kidone")]
    [TestCase("guest_2", "guest_2")]
    public void NamesAreCleaned(string name, string expected)
    {
        Assert.That(ProfileRules.CleanName(name), Is.EqualTo(expected));
    }

    /// <summary>Names that are too short, too long, reserved, or internal-looking are refused.</summary>
    [TestCase(null)]
    [TestCase("")]
    [TestCase("ab")]
    [TestCase("!!")]
    [TestCase("local")]
    [TestCase("admin")]
    [TestCase("Shared")]
    [TestCase("__shared")]
    [TestCase("abcdefghijklmnopqrstuvwxyz12345")]
    public void BadNamesAreRefused(string name)
    {
        Assert.That(ProfileRules.CleanName(name), Is.Null);
    }
}
