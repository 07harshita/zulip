var activity = (function () {
var exports = {};

/*
    Helpers for detecting user activity and managing user idle states
*/

/* After this amount of no activity, mark you idle regardless of your focus */
var DEFAULT_IDLE_TIMEOUT_MS = 30 * 60 * 1000;
/* Time between keep-alive pings */
var ACTIVE_PING_INTERVAL_MS = 60 * 1000;

/* Timeouts for away and idle state */
var AWAY_THRESHOLD_SECS = 10 * 60;
var IDLE_THRESHOLD_SECS = DEFAULT_IDLE_TIMEOUT_MS / 1000;

/* Keep in sync with views.py:json_update_active_status() */
var ACTIVE = "active";
var IDLE = "idle";

var has_focus = true;
var ping_timer;

var user_info = {};

function sort_users(users, user_info) {
    // TODO sort by unread count first, once we support that
    users.sort(function (a, b) {
        if (user_info[a] === 'active' && user_info[b] !== 'active') {
            return -1;
        } else if (user_info[b] === 'active' && user_info[a] !== 'active') {
            return 1;
        }

        if (user_info[a] === 'away' && user_info[b] !== 'away') {
            return -1;
        } else if (user_info[b] === 'away' && user_info[a] !== 'away') {
            return 1;
        }

        // Sort equivalent PM names alphabetically
        var full_name_a = a;
        var full_name_b = b;
        if (people_dict[a] !== undefined) {
            full_name_a = people_dict[a].full_name;
        }
        if (people_dict[b] !== undefined) {
            full_name_b = people_dict[b].full_name;
        }
        return util.strcmp(full_name_a, full_name_b);
    });

    return users;
}

function focus_lost() {
    if (!has_focus) {
        return false;
    }

    has_focus = false;

    clearInterval(ping_timer);
    ping_timer = undefined;

    $.post('/json/update_active_status', {status: IDLE});

}

function update_users() {
    var users = sort_users(Object.keys(user_info), user_info);
    ui.set_presence_list(users, user_info);
}

function status_from_timestamp(baseline_time, presence) {
    if (presence.website === undefined) {
        return 'idle';
    }

    var age = baseline_time - presence.website.timestamp;

    var status = 'idle';
    if (presence.website.status === ACTIVE && age >= 0) {
        if (age < AWAY_THRESHOLD_SECS) {
            status = 'active';
        } else if (age < IDLE_THRESHOLD_SECS) {
            status = 'away';
        }
    }
    return status;
}

function focus_ping() {
    if (!has_focus) {
        return;
    }

    $.post('/json/update_active_status', {status: ACTIVE}, function (data) {
        if (data === undefined || data.presences === undefined) {
            // We sometimes receive no data even on successful
            // requests; we should figure out why but this will
            // prevent us from throwing errors until then
            return;
        }

        user_info = {};

        // Update Zephyr mirror activity warning
        if (data.zephyr_mirror_active === false) {
            $('#zephyr-mirror-error').show();
        } else {
            $('#zephyr-mirror-error').hide();
        }

        // Ping returns the active peer list
        $.each(data.presences, function (this_email, presence) {
            if (page_params.email !== this_email) {
                user_info[this_email] = status_from_timestamp(data.server_timestamp, presence);
            }
        });
        update_users();
    });
}

function focus_gained() {
    if (!has_focus) {
        has_focus = true;
        ping_timer = setInterval(focus_ping, ACTIVE_PING_INTERVAL_MS);

        focus_ping();
    }
}

exports.initialize = function () {
    $(window).focus(focus_gained);
    $(window).idle({idle: DEFAULT_IDLE_TIMEOUT_MS,
                onIdle: focus_lost,
                onActive: focus_gained,
                keepTracking: true});

    ping_timer = setInterval(focus_ping, ACTIVE_PING_INTERVAL_MS);

    focus_ping();
};

// Set user statuses. `users` should be an object with user emails as keys
// and presence information (see `status_from_timestamp`) as values.
//
// The object does not need to include every user, only the ones
// whose presence you wish to update.
//
// This rerenders the user sidebar at the end, which can be slow if done too
// often, so try to avoid calling this repeatedly.
exports.set_user_statuses = function (users, server_time) {
    $.each(users, function (email, presence) {
        if (email === page_params.email) {
            return;
        }
        user_info[email] = status_from_timestamp(server_time, presence);
    });

    update_users();
};

return exports;

}());
