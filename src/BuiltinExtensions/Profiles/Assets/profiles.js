/** Desktop profile switcher: a button in the top tab bar that opens a dialog for switching, creating, and managing profiles. */
class ProfileSwitcherClass {

    constructor() {
        /** Profiles known to the server, as a list of {id, has_pin}. */
        this.profiles = [];
        /** ID of the profile this browser is using, or an empty string for the shared library. */
        this.current = '';
        /** ID of the profile whose PIN prompt is open in the dialog, or null. */
        this.pendingId = null;
        this.modalId = 'profile_switcher_modal';
    }

    /** Adds the button to the top bar and loads the profile list. Called once the session is ready. */
    register() {
        let tabList = document.getElementById('toptablist');
        if (!tabList || document.getElementById('profile_switcher_button')) {
            return;
        }
        let item = document.createElement('li');
        item.className = 'nav-item';
        item.innerHTML = `<a class="nav-link" href="#" id="profile_switcher_button" title="Switch profile. Each profile has its own image library."></a>`;
        let spacer = tabList.querySelector('.ms-auto');
        tabList.insertBefore(item, spacer);
        item.querySelector('a').addEventListener('click', (e) => {
            e.preventDefault();
            this.open();
        });
        this.refresh();
    }

    /** Returns the name to show for a profile ID. */
    displayName(id) {
        return id ? id : 'Shared';
    }

    /** Reloads the profile list from the server, then updates the button and (if open) the dialog. */
    refresh(callback = null) {
        genericRequest('ProfileList', {}, data => {
            this.profiles = data.profiles;
            this.current = data.current;
            let button = document.getElementById('profile_switcher_button');
            if (button) {
                button.innerText = `Profile: ${this.displayName(this.current)}`;
            }
            if (document.getElementById(this.modalId)) {
                this.renderBody();
            }
            if (callback) {
                callback();
            }
        });
    }

    /** Shows a message inside the dialog, as an error or as plain information. */
    showMessage(text, isError = true) {
        let area = document.getElementById('profile_switcher_message');
        if (area) {
            area.innerText = text;
            area.style.color = isError ? 'var(--red, #e55)' : '';
        }
    }

    /** Sends a profile request, showing any error in the dialog instead of a page-wide popup. */
    request(route, data, callback) {
        this.showMessage('');
        genericRequest(route, data, callback, 0, e => {
            this.showMessage(`${e}`);
        });
    }

    /** Opens the dialog, creating it the first time. */
    open() {
        if (!document.getElementById(this.modalId)) {
            let html = modalHeader(this.modalId, 'Profiles')
                + `<div class="modal-body" id="profile_switcher_body"></div>`
                + `<div class="modal-footer"><button type="button" class="btn btn-secondary basic-button translate" id="profile_switcher_close">Close</button></div>`
                + modalFooter();
            let holder = createDiv(null, 'profile-switcher-holder', html);
            document.body.appendChild(holder);
            document.getElementById('profile_switcher_close').addEventListener('click', () => {
                $(`#${this.modalId}`).modal('hide');
            });
        }
        this.pendingId = null;
        this.renderBody();
        $(`#${this.modalId}`).modal('show');
        this.refresh();
    }

    /** Builds one row of the profile list. */
    profileRowHtml(id, hasPin) {
        let isCurrent = id == this.current;
        let label = escapeHtml(this.displayName(id)) + (hasPin ? ' &#x1F512;' : '') + (isCurrent ? ' (current)' : '');
        let html = `<div style="margin-bottom:0.4rem"><button type="button" class="btn ${isCurrent ? 'btn-primary' : 'btn-secondary'} basic-button profile-switcher-pick" data-profile="${escapeHtml(id)}" data-haspin="${hasPin ? '1' : '0'}" style="min-width:14rem;text-align:left"${isCurrent ? ' disabled' : ''}>${label}</button>`;
        if (this.pendingId == id && id) {
            html += ` <input type="password" inputmode="numeric" autocomplete="off" class="auto-text" id="profile_switcher_pin" placeholder="PIN" style="width:7rem">`
                + ` <button type="button" class="btn btn-primary basic-button" id="profile_switcher_pin_go">Open</button>`;
        }
        return html + `</div>`;
    }

    /** Draws the dialog's contents from the current state. */
    renderBody() {
        let body = document.getElementById('profile_switcher_body');
        if (!body) {
            return;
        }
        let html = `<p>Each profile has its own image library. Models, presets, and everything else are shared. The page reloads after switching.</p>`;
        html += this.profileRowHtml('', false);
        for (let profile of this.profiles) {
            html += this.profileRowHtml(profile.id, profile.has_pin);
        }
        html += `<div id="profile_switcher_message" style="min-height:1.5rem;margin:0.5rem 0"></div>`;
        html += `<hr><h6>New profile</h6>`
            + `<input type="text" autocomplete="off" class="auto-text" id="profile_switcher_new_name" placeholder="Name (letters and digits)" style="width:14rem"> `
            + `<input type="password" inputmode="numeric" autocomplete="off" class="auto-text" id="profile_switcher_new_pin" placeholder="PIN (optional)" style="width:9rem"> `
            + `<button type="button" class="btn btn-primary basic-button" id="profile_switcher_create">Create</button>`;
        if (this.current) {
            html += `<hr><h6>Manage "${escapeHtml(this.current)}"</h6>`
                + `<input type="password" inputmode="numeric" autocomplete="off" class="auto-text" id="profile_switcher_cur_pin" placeholder="Current PIN" style="width:9rem"> `
                + `<input type="password" inputmode="numeric" autocomplete="off" class="auto-text" id="profile_switcher_change_pin" placeholder="New PIN (empty = none)" style="width:12rem"> `
                + `<button type="button" class="btn btn-secondary basic-button" id="profile_switcher_setpin">Change PIN</button> `
                + `<button type="button" class="btn btn-danger basic-button" id="profile_switcher_delete" title="Needs the current PIN. Image files stay on disk.">Delete profile</button>`;
        }
        body.innerHTML = html;
        for (let button of body.querySelectorAll('.profile-switcher-pick')) {
            button.addEventListener('click', () => {
                this.pick(button.dataset.profile, button.dataset.haspin == '1');
            });
        }
        let pinInput = document.getElementById('profile_switcher_pin');
        if (pinInput) {
            pinInput.focus();
            pinInput.addEventListener('keydown', (e) => {
                if (e.key == 'Enter') {
                    this.switchTo(this.pendingId, pinInput.value);
                }
            });
            document.getElementById('profile_switcher_pin_go').addEventListener('click', () => {
                this.switchTo(this.pendingId, pinInput.value);
            });
        }
        document.getElementById('profile_switcher_create').addEventListener('click', () => {
            this.create();
        });
        if (this.current) {
            document.getElementById('profile_switcher_setpin').addEventListener('click', () => {
                this.setPin();
            });
            document.getElementById('profile_switcher_delete').addEventListener('click', () => {
                this.deleteCurrent();
            });
        }
    }

    /** Handles a click on a profile: switches straight away, or asks for the PIN first. */
    pick(id, hasPin) {
        if (hasPin) {
            this.pendingId = id;
            this.renderBody();
            return;
        }
        this.switchTo(id, '');
    }

    /** Asks the server to switch this browser to a profile, then reloads the page so everything uses its library. */
    switchTo(id, pin) {
        this.request('ProfileSwitch', { 'id': id, 'pin': pin }, data => {
            window.location.reload();
        });
    }

    /** Creates a profile from the "New profile" inputs. */
    create() {
        let name = document.getElementById('profile_switcher_new_name').value;
        let pin = document.getElementById('profile_switcher_new_pin').value;
        this.request('ProfileCreate', { 'name': name, 'pin': pin }, data => {
            this.refresh(() => {
                this.showMessage(`Created profile "${data.id}". Click it above to switch to it.`, false);
            });
        });
    }

    /** Changes the current profile's PIN from the "Manage" inputs. */
    setPin() {
        let pin = document.getElementById('profile_switcher_cur_pin').value;
        let newPin = document.getElementById('profile_switcher_change_pin').value;
        this.request('ProfileSetPin', { 'id': this.current, 'pin': pin, 'new_pin': newPin }, data => {
            this.refresh(() => {
                this.showMessage(newPin ? 'PIN changed.' : 'PIN removed.', false);
            });
        });
    }

    /** Deletes the current profile after a confirmation, then reloads into the shared library. */
    deleteCurrent() {
        if (!confirm(`Delete the profile "${this.current}"? Its image files stay on disk, but it will no longer appear here.`)) {
            return;
        }
        let pin = document.getElementById('profile_switcher_cur_pin').value;
        this.request('ProfileDelete', { 'id': this.current, 'pin': pin }, data => {
            window.location.reload();
        });
    }
}

let extensionProfileSwitcher = new ProfileSwitcherClass();
sessionReadyCallbacks.push(() => {
    extensionProfileSwitcher.register();
});
