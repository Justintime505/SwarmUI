using FreneticUtilities.FreneticDataSyntax;
using FreneticUtilities.FreneticExtensions;
using FreneticUtilities.FreneticToolkit;
using Microsoft.AspNetCore.Http;
using Newtonsoft.Json.Linq;
using SwarmUI.Accounts;
using SwarmUI.Core;
using SwarmUI.Utils;
using SwarmUI.WebAPI;

namespace SwarmUI.Builtin_ProfilesExtension;

/// <summary>Pure helpers for profile names and PINs, kept separate so they can be unit tested.</summary>
public static class ProfileRules
{
    /// <summary>Shortest allowed PIN, in digits.</summary>
    public const int MinPinLength = 4;

    /// <summary>Longest allowed PIN, in digits.</summary>
    public const int MaxPinLength = 8;

    /// <summary>Longest allowed profile name.</summary>
    public const int MaxNameLength = 30;

    /// <summary>Returns whether the text is an acceptable PIN. An empty string is acceptable and means "no PIN".</summary>
    public static bool IsValidPin(string pin)
    {
        if (pin is null)
        {
            return false;
        }
        if (pin.Length == 0)
        {
            return true;
        }
        return pin.Length >= MinPinLength && pin.Length <= MaxPinLength && pin.All(c => c >= '0' && c <= '9');
    }

    /// <summary>
    /// Turns a PIN into the text stored (hashed) as the profile account's password.
    /// The prefix lifts short PINs over the account system's minimum password length, and keeps a PIN from ever matching a real password.
    /// </summary>
    public static string WrapPin(string pin)
    {
        return $"swarm-profile-pin:{pin}";
    }

    /// <summary>Cleans a requested profile name into a valid user ID, or returns null if it cannot be used.</summary>
    public static string CleanName(string name)
    {
        if (name is null)
        {
            return null;
        }
        string cleaned = SessionHandler.UsernameValidator.TrimToMatches(name).ToLowerFast();
        if (cleaned.Length < 3 || cleaned.Length > MaxNameLength || cleaned.StartsWith('_') || SessionHandler.ReservedUsernames.Contains(cleaned))
        {
            return null;
        }
        return cleaned;
    }
}

/// <summary>
/// Extension that adds profiles: lightweight accounts that each have their own image library, optionally protected by a PIN,
/// while sharing models, backends, presets, and saved data with the local user.
/// A browser's active profile is tracked with the normal login cookie, see <see cref="WebServer.GetProfileUserFor"/>.
/// </summary>
public class ProfilesExtension : Extension
{
    /// <summary>Permissions that a profile never receives: these would let it reach other profiles' libraries or change accounts.
    /// Includes the "*" wildcard, which is itself a registered permission and would grant all of the others.</summary>
    public static HashSet<string> WithheldPermissions = [Permissions.Admin.ID, Permissions.ManageUsers.ID, Permissions.ViewOthersOutputs.ID];

    /// <summary>Limits PIN attempts per connecting address.</summary>
    public static SimpleRateLimiter<string> PinRateLimiterByIP = new(10, TimeSpan.FromMinutes(1));

    /// <summary>Limits PIN attempts per profile, across all addresses.</summary>
    public static SimpleRateLimiter<string> PinRateLimiterByProfile = new(10, TimeSpan.FromMinutes(1));

    /// <inheritdoc/>
    public override void OnPreInit()
    {
        ScriptFiles.Add("Assets/profiles.js");
    }

    /// <inheritdoc/>
    public override void OnInit()
    {
        API.RegisterAPICall(ProfileList, false, Permissions.Fundamental);
        API.RegisterAPICall(ProfileCreate, true, Permissions.Fundamental);
        API.RegisterAPICall(ProfileSwitch, true, Permissions.Fundamental);
        API.RegisterAPICall(ProfileSetPin, true, Permissions.Fundamental);
        API.RegisterAPICall(ProfileDelete, true, Permissions.Fundamental);
    }

    /// <inheritdoc/>
    public override void OnPreLaunch()
    {
        // Done here rather than in OnInit so that permissions registered by every other extension are included.
        EnsureProfileRole();
    }

    /// <summary>Creates or refreshes the role that profile accounts use: every registered permission except <see cref="WithheldPermissions"/>.</summary>
    public static void EnsureProfileRole()
    {
        lock (Program.Sessions.DBLock)
        {
            Role role = Program.Sessions.Roles.GetOrAdd(WebServer.ProfileRoleID, _ => new Role(WebServer.ProfileRoleID));
            role.Data.Name = "Profile";
            role.Data.Description = "(Managed by the Profiles extension, do not edit). A profile: has its own image library, shares everything else with the local user.";
            role.Data.MaxQueued = 999_999_999;
            role.Data.PermissionFlags = [.. Permissions.Registered.Keys.Where(id => !WithheldPermissions.Contains(id))];
            Program.Sessions.Save();
            foreach (User user in Program.Sessions.Users.Values.Where(u => u.IsProfile))
            {
                user.BuildRoles();
            }
        }
    }

    /// <summary>Returns every profile account.</summary>
    public static List<User> ListProfileUsers()
    {
        lock (Program.Sessions.DBLock)
        {
            List<string> ids = [.. Program.Sessions.UserDatabase.FindAll().Select(u => u.ID)];
            return [.. ids.Select(id => Program.Sessions.GetUser(id, false)).Where(u => u is not null && u.IsProfile).OrderBy(u => u.UserID)];
        }
    }

    /// <summary>Returns whether the profile has a PIN set.</summary>
    public static bool HasPin(User profile)
    {
        return !Utilities.CompareHashedPassword(profile.UserID, ProfileRules.WrapPin(""), profile.Data.PasswordHashed);
    }

    /// <summary>Returns the profile for an ID, or null if there is no such profile.</summary>
    public static User GetProfile(string id)
    {
        string cleaned = ProfileRules.CleanName(id);
        if (cleaned is null)
        {
            return null;
        }
        User user = Program.Sessions.GetUser(cleaned, false);
        return user is not null && user.IsProfile ? user : null;
    }

    /// <summary>
    /// Checks a PIN attempt against a profile, applying the rate limits.
    /// Returns null if the PIN is correct, otherwise an error response to send back.
    /// </summary>
    public static JObject CheckPin(HttpContext context, User profile, string pin)
    {
        string ip = WebUtil.GetIPString(context);
        if (!PinRateLimiterByIP.TryUseOne(ip) || !PinRateLimiterByProfile.TryUseOne(profile.UserID))
        {
            Logs.Warning($"PIN attempt from {ip} for profile '{profile.UserID}' was rate limited.");
            return new JObject() { ["error"] = "Too many attempts. Wait a minute and try again.", ["error_id"] = "ratelimit" };
        }
        if (!ProfileRules.IsValidPin(pin ?? "") || !Utilities.CompareHashedPassword(profile.UserID, ProfileRules.WrapPin(pin ?? ""), profile.Data.PasswordHashed))
        {
            Logs.Warning($"PIN attempt from {ip} for profile '{profile.UserID}' failed.");
            return new JObject() { ["error"] = "Wrong PIN.", ["error_id"] = "wrong_pin" };
        }
        return null;
    }

    /// <summary>Removes the profile cookie from the browser, returning it to the shared (local) user.</summary>
    public static void ClearProfileCookie(HttpContext context)
    {
        context.Response.Cookies.Append("swarm_token", "", new CookieOptions() { HttpOnly = true, MaxAge = TimeSpan.FromSeconds(-1), SameSite = SameSiteMode.Lax });
    }

    [API.APIDescription("Lists the profiles on this server, and which one this browser is currently using.",
        """
            "profiles":
            [
                {
                    "id": "name",
                    "has_pin": true
                }
            ],
            "current": "name" // or empty string when using the shared library
        """)]
    public static async Task<JObject> ProfileList(HttpContext context, Session session)
    {
        JArray profiles = [.. ListProfileUsers().Select(u => new JObject() { ["id"] = u.UserID, ["has_pin"] = HasPin(u) })];
        return new JObject()
        {
            ["profiles"] = profiles,
            ["current"] = WebServer.GetProfileUserFor(context)?.UserID ?? ""
        };
    }

    [API.APIDescription("Creates a new profile with its own image library.",
        """
            "success": true,
            "id": "name"
        """)]
    public static async Task<JObject> ProfileCreate(Session session,
        [API.APIParameter("Name for the profile. Letters, digits and underscore, at least 3 characters.")] string name,
        [API.APIParameter("PIN of 4 to 8 digits, or empty for no PIN.")] string pin = "")
    {
        string cleaned = ProfileRules.CleanName(name);
        if (cleaned is null)
        {
            return new JObject() { ["error"] = $"Profile names need 3 to {ProfileRules.MaxNameLength} letters or digits, and some names are reserved." };
        }
        if (!ProfileRules.IsValidPin(pin))
        {
            return new JObject() { ["error"] = $"A PIN must be {ProfileRules.MinPinLength} to {ProfileRules.MaxPinLength} digits." };
        }
        User user = Program.Sessions.RegisterUser(cleaned, ProfileRules.WrapPin(pin), WebServer.ProfileRoleID, true);
        if (user is null)
        {
            return new JObject() { ["error"] = "That name is already in use." };
        }
        // Start from the local user's current settings (theme, path format, etc.), then keep only the profile role.
        FDSSection localSettings = Program.Sessions.GetUser(SessionHandler.LocalUserID).Settings.Save(false);
        user.Settings.Load(localSettings);
        user.Settings.Roles = [WebServer.ProfileRoleID];
        user.Settings.TrySetFieldModified(nameof(User.Settings.Roles), true);
        user.BuildRoles();
        user.Save();
        Logs.Info($"User {session.User.UserID} created profile '{cleaned}'.");
        return new JObject() { ["success"] = true, ["id"] = cleaned };
    }

    [API.APIDescription("Switches this browser to a profile (checking its PIN), or back to the shared library. Sets or clears a cookie; reload the page afterwards.",
        """
            "success": true
            // or
            "error": "Wrong PIN.", "error_id": "wrong_pin" // or "ratelimit", "no_such_profile"
        """)]
    public static async Task<JObject> ProfileSwitch(HttpContext context, Session session,
        [API.APIParameter("ID of the profile to switch to, or empty to return to the shared library.")] string id = "",
        [API.APIParameter("The profile's PIN, or empty if it has none.")] string pin = "")
    {
        if (string.IsNullOrWhiteSpace(id) || id == SessionHandler.LocalUserID)
        {
            ClearProfileCookie(context);
            return new JObject() { ["success"] = true };
        }
        User profile = GetProfile(id);
        if (profile is null)
        {
            return new JObject() { ["error"] = "There is no such profile.", ["error_id"] = "no_such_profile" };
        }
        JObject pinError = CheckPin(context, profile, pin);
        if (pinError is not null)
        {
            return pinError;
        }
        string userAgent = WebUtil.AllowedXForwardedForChars.TrimToMatches(context.Request.Headers.UserAgent.FirstOrDefault() ?? "unknown");
        (_, string token) = profile.CreateLoginSession(WebUtil.GetIPString(context), userAgent);
        if (token is null)
        {
            return new JObject() { ["error"] = "Could not open that profile.", ["error_id"] = "internal_error" };
        }
        context.Response.Cookies.Append("swarm_token", token, new CookieOptions() { HttpOnly = true, Expires = DateTimeOffset.UtcNow.AddYears(1), SameSite = SameSiteMode.Lax });
        return new JObject() { ["success"] = true };
    }

    [API.APIDescription("Changes or removes a profile's PIN.",
        """
            "success": true
        """)]
    public static async Task<JObject> ProfileSetPin(HttpContext context, Session session,
        [API.APIParameter("ID of the profile.")] string id,
        [API.APIParameter("The profile's current PIN, or empty if it has none.")] string pin = "",
        [API.APIParameter("The new PIN of 4 to 8 digits, or empty to remove the PIN.")] string new_pin = "")
    {
        User profile = GetProfile(id);
        if (profile is null)
        {
            return new JObject() { ["error"] = "There is no such profile.", ["error_id"] = "no_such_profile" };
        }
        if (!ProfileRules.IsValidPin(new_pin))
        {
            return new JObject() { ["error"] = $"A PIN must be {ProfileRules.MinPinLength} to {ProfileRules.MaxPinLength} digits." };
        }
        JObject pinError = CheckPin(context, profile, pin);
        if (pinError is not null)
        {
            return pinError;
        }
        lock (Program.Sessions.DBLock)
        {
            profile.Data.PasswordHashed = Utilities.HashPassword(profile.UserID, ProfileRules.WrapPin(new_pin));
            profile.Save();
        }
        return new JObject() { ["success"] = true };
    }

    [API.APIDescription("Deletes a profile. Its image files are left on disk in its output folder.",
        """
            "success": true
        """)]
    public static async Task<JObject> ProfileDelete(HttpContext context, Session session,
        [API.APIParameter("ID of the profile to delete.")] string id,
        [API.APIParameter("The profile's PIN, or empty if it has none.")] string pin = "")
    {
        User profile = GetProfile(id);
        if (profile is null)
        {
            return new JObject() { ["error"] = "There is no such profile.", ["error_id"] = "no_such_profile" };
        }
        JObject pinError = CheckPin(context, profile, pin);
        if (pinError is not null)
        {
            return pinError;
        }
        if (WebServer.GetProfileUserFor(context)?.UserID == profile.UserID)
        {
            ClearProfileCookie(context);
        }
        Program.Sessions.RemoveUser(profile);
        Logs.Info($"User {session.User.UserID} deleted profile '{profile.UserID}'. Its images remain in its output folder.");
        return new JObject() { ["success"] = true };
    }
}
