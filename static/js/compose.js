var compose = (function () {

var exports = {};
var is_composing_message = false;
var focused_recipient;
var message_snapshot;
var empty_subject_placeholder = "(no topic)";

// This function resets an input type="file".  Pass in the
// jquery object.
function clear_out_file_list(jq_file_list) {
    var clone_for_ie_sake = jq_file_list.clone(true);
    jq_file_list.replaceWith(clone_for_ie_sake);

    // Hack explanation:
    // IE won't let you do this (untested, but so says StackOverflow):
    //    $("#file_input").val("");
}

// Show the compose box.
function show_box(tabname, focus_area) {
    if (tabname === "stream") {
        $('#private-message').hide();
        $('#stream-message').show();
        $("#stream_toggle").addClass("active");
        $("#private_message_toggle").removeClass("active");
    } else {
        $('#private-message').show();
        $('#stream-message').hide();
        $("#stream_toggle").removeClass("active");
        $("#private_message_toggle").addClass("active");
    }
    $("#send-status").removeClass(status_classes).hide();
    $('#compose').css({visibility: "visible"});
    $("#new_message_content").trigger("autosize");
    $(".new_message_textarea").css("min-height", "3em");

    if (focus_area !== undefined) {
        focus_area.focus().select();
    }

    // If the compose box is obscuring the currently selected message,
    // scroll up until the message is no longer occluded.
    if (current_msg_list.selected_id() === -1) {
        // If there's no selected message, there's no need to
        // scroll the compose box to avoid it.
        return;
    }
    var selected_row = current_msg_list.selected_row();
    var cover = selected_row.offset().top + selected_row.height()
        - $("#compose").offset().top;
    if (cover > 0) {
        viewport.user_initiated_animate_scroll(cover+5);
    }

    // Disable the notifications bar if it overlaps with the composebox
    notifications_bar.maybe_disable();
}

function clear_box() {
    exports.snapshot_message();
    $("#compose").find('input[type=text], textarea').val('');
    $("#new_message_content").trigger('autosize');
    $("#send-status").hide(0);
}

function hide_box() {
    $('.message_comp').find('input, textarea, button').blur();
    $('#stream-message').hide();
    $('#private-message').hide();
    $(".new_message_textarea").css("min-height", "");
    notifications_bar.enable();
    exports.unfade_messages(true);
    $('.message_comp').hide();
    $("#compose_controls").show();
}

function update_lock_icon_for_stream(stream_name) {
    var icon = $("#compose-lock-icon");
    if (subs.get_invite_only(stream_name)) {
        icon.show();
    } else {
        icon.hide();
    }
}

// In an attempt to decrease mixing, make the composebox's
// stream bar look like what you're replying to.
// (In particular, if there's a color associated with it,
//  have that color be reflected here too.)
exports.decorate_stream_bar = function (stream_name) {
    var color = subs.get_color(stream_name);
    update_lock_icon_for_stream(stream_name);
    $("#stream-message .message_header_stream")
        .css('background-color', color)
        .removeClass(stream_color.color_classes)
        .addClass(stream_color.get_color_class(color));
};

exports.unfade_messages = function (clear_state) {
    if (focused_recipient === undefined) {
        return;
    }

    rows.get_table(current_msg_list.table_name).find(".recipient_row, .message_row")
                                               .removeClass("faded").addClass("unfaded");
    if (clear_state === true) {
        focused_recipient = undefined;
    }
    ui.update_floating_recipient_bar();
};

exports.update_faded_messages = function () {
    if (focused_recipient === undefined) {
        return;
    }

    if ((focused_recipient.type === "stream" && focused_recipient.subject === "") ||
        (focused_recipient.type === "private" && focused_recipient.reply_to === "")) {
        exports.unfade_messages();
        return;
    }

    var i;
    var all_elts = rows.get_table(current_msg_list.table_name).find(".recipient_row, .message_row");
    var should_fade_message = false;
    // Note: The below algorithm relies on the fact that all_elts is
    // sorted as it would be displayed in the message view
    for (i = 0; i < all_elts.length; i++) {
        var elt = $(all_elts[i]);
        if (elt.hasClass("recipient_row")) {
            should_fade_message = !util.same_recipient(focused_recipient, current_msg_list.get(rows.id(elt)));
        }

        if (should_fade_message) {
            elt.removeClass("unfaded").addClass("faded");
        } else {
            elt.removeClass("faded").addClass("unfaded");
        }
    }

    ui.update_floating_recipient_bar();
};

exports.update_recipient_on_narrow = function () {
    if (!compose.composing()) {
        return;
    }
    if (compose.message_content() !== "") {
        return;
    }
    var compose_opts = {};
    narrow.set_compose_defaults(compose_opts);
    if (compose_opts.stream) {
        compose.start("stream");
    } else {
        compose.start("private");
    }
};

function update_fade () {
    if (!is_composing_message) {
        return;
    }

    // Construct focused_recipient as a mocked up element which has all the
    // fields of a message used by util.same_recipient()
    focused_recipient = {
        type: is_composing_message
    };

    if (focused_recipient.type === "stream") {
        focused_recipient.stream = $('#stream').val();
        focused_recipient.subject = $('#subject').val();
    } else {
        // Normalize the recipient list so it matches the one used when
        // adding the message (see add_message_metadata(), zulip.js).
        focused_recipient.reply_to = util.normalize_recipients(
                $('#private_message_recipient').val());
    }

    compose.update_faded_messages();
}

$(function () {
    $('#stream,#subject,#private_message_recipient').bind({
         keyup: update_fade,
         change: update_fade
    });
});

exports.start = function (msg_type, opts) {
    if (reload.is_in_progress()) {
        return;
    }

    $("#compose_close").show();
    $("#compose_controls").hide();
    $('.message_comp').show();

    var default_opts = {
        message_type:     msg_type,
        stream:           '',
        subject:          '',
        private_message_recipient: '',
        trigger:          'unknown'
    };

    // Set default parameters based on the current narrowed view.
    narrow.set_compose_defaults(default_opts);

    opts = _.extend(default_opts, opts);

    if (!(compose.composing() === msg_type &&
          ((msg_type === "stream" &&
            opts.stream === compose.stream_name() &&
            opts.subject === compose.subject()) ||
           (msg_type === "private" &&
            opts.private_message_recipient === compose.recipient())))) {
        // Clear the compose box if the existing message is to a different recipient
        clear_box();
    }

    compose.stream_name(opts.stream);
    compose.subject(opts.subject);

    // Set the recipients with a space after each comma, so it looks nice.
    compose.recipient(opts.private_message_recipient.replace(/,\s*/g, ", "));

    // If the user opens the compose box, types some text, and then clicks on a
    // different stream/subject, we want to keep the text in the compose box
    if (opts.content !== undefined) {
        compose.message_content(opts.content);
    }

    ui.change_tab_to("#home");

    var focus_area;
    if (msg_type === 'stream' && opts.stream && ! opts.subject) {
        focus_area = 'subject';
    } else if ((msg_type === 'stream' && opts.stream)
               || (msg_type === 'private' && opts.private_message_recipient)) {
        focus_area = 'new_message_content';
    }

    is_composing_message = msg_type;

    if (msg_type === 'stream') {
        show_box('stream', $("#" + (focus_area || 'stream')));
    } else {
        show_box('private', $("#" + (focus_area || 'private_message_recipient')));
    }

    update_fade();

    exports.decorate_stream_bar(opts.stream);
    $(document).trigger($.Event('compose_started.zulip', opts));
};

function abort_xhr () {
    $("#compose-send-button").removeAttr("disabled");
    var xhr = $("#compose").data("filedrop_xhr");
    if (xhr !== undefined) {
        xhr.abort();
        $("#compose").removeData("filedrop_xhr");
    }
}

exports.cancel = function () {
    $("#compose_close").hide();
    clear_box();
    hide_box();
    abort_xhr();
    is_composing_message = false;
    if (message_snapshot !== undefined) {
        $('#restore-draft').show();
    }
    $(document).trigger($.Event('compose_canceled.zulip'));
    respond_to_cursor = false;
};

exports.empty_subject_placeholder = function () {
    return empty_subject_placeholder;
};

function create_message_object() {
    // Subjects are optional, and we provide a placeholder if one isn't given.
    var subject = compose.subject();
    if (subject === "") {
        subject = compose.empty_subject_placeholder();
    }
    var message = {client: 'website',
                   type: compose.composing(),
                   subject: subject,
                   stream: compose.stream_name(),
                   private_message_recipient: compose.recipient(),
                   content: compose.message_content()};

    if (message.type === "private") {
        // TODO: this should be collapsed with the code in composebox_typeahead.js
        message.to = compose.recipient().split(/\s*[,;]\s*/);
        message.reply_to = compose.recipient();
    } else {
        message.to = compose.stream_name();
    }
    return message;
}

exports.snapshot_message = function (message) {
    if (!exports.composing() || (exports.message_content() === "")) {
        // If you aren't in the middle of composing the body of a
        // message, don't try to snapshot.
        return;
    }

    if (message !== undefined) {
        message_snapshot = _.extend({}, message);
    } else {
        // Save what we can.
        message_snapshot = create_message_object();
    }
};

function clear_message_snapshot() {
    $("#restore-draft").hide();
    message_snapshot = undefined;
}

exports.restore_message = function () {
    if (!message_snapshot) {
        return;
    }
    var snapshot_copy = _.extend({}, message_snapshot);
    if ((snapshot_copy.type === "stream" &&
         snapshot_copy.stream.length > 0 &&
         snapshot_copy.subject.length > 0) ||
        (snapshot_copy.type === "private" &&
         snapshot_copy.reply_to.length > 0)) {
        snapshot_copy = _.extend({replying_to_message: snapshot_copy},
                                 snapshot_copy);
    }
    clear_message_snapshot();
    exports.unfade_messages(true);
    compose.start(snapshot_copy.type, snapshot_copy);
};

function compose_error(error_text, bad_input) {
    $('#send-status').removeClass(status_classes)
               .addClass('alert-error')
               .stop(true).fadeTo(0, 1);
    $('#error-msg').html(error_text);
    $("#compose-send-button").removeAttr('disabled');
    $("#sending-indicator").hide();
    bad_input.focus().select();
}

var send_options;

function send_message() {
    var send_status = $('#send-status');

    var request = create_message_object();
    exports.snapshot_message(request);

    if (request.type === "private") {
        request.to = JSON.stringify(request.to);
    } else {
        request.to = JSON.stringify([request.to]);
    }

    $.ajax({
        dataType: 'json', // This seems to be ignored. We still get back an xhr.
        url: '/json/send_message',
        type: 'POST',
        data: request,
        success: function (resp, statusText, xhr) {
            clear_box();
            send_status.hide();
            is_composing_message = false;
            hide_box();
            if (request.type === "private") {
                onboarding.mark_checklist_step("sent_private_message");
            } else {
                onboarding.mark_checklist_step("sent_stream_message");
            }
            clear_message_snapshot();
            $("#compose-send-button").removeAttr('disabled');
            $("#sending-indicator").hide();
            send_status.hide();
            if (respond_to_cursor && (feature_flags.always_open_compose ||
                                      narrow.narrowed_by_reply())) {
                respond_to_message({trigger: 'autorespond'});
            }
            else {
                respond_to_cursor = false;

                if (feature_flags.always_open_compose) {
                    var new_msg = _.extend({replying_to_message: request},
                                           request);
                    new_msg.content = "";
                    compose.start(new_msg.type, new_msg);
                }
            }
        },
        error: function (xhr, error_type) {
            if (error_type !== 'timeout' && reload.is_pending()) {
                // The error might be due to the server changing
                reload.initiate({immediate: true, send_after_reload: true});
                return;
            }
            var response = util.xhr_error_message("Error sending message", xhr);
            compose_error(response, $('#new_message_content'));
        }
    });

}

exports.finish = function () {
    if (! compose.validate()) {
        return false;
    }
    send_message();
    // TODO: Do we want to fire the event even if the send failed due
    // to a server-side error?
    $(document).trigger($.Event('compose_finished.zulip'));
    return true;
};

$(function () {
    $("#compose form").on("submit", function (e) {
       e.preventDefault();
       compose.finish();
    });
});

exports.composing = function () {
    return is_composing_message;
};

function get_or_set(fieldname, keep_outside_whitespace) {
    // We can't hoist the assignment of 'elem' out of this lambda,
    // because the DOM element might not exist yet when get_or_set
    // is called.
    return function (newval) {
        var elem = $('#'+fieldname);
        var oldval = elem.val();
        if (newval !== undefined) {
            elem.val(newval);
        }
        return keep_outside_whitespace ? oldval : $.trim(oldval);
    };
}

exports.stream_name     = get_or_set('stream');
exports.subject         = get_or_set('subject');
exports.message_content = get_or_set('new_message_content', true);
exports.recipient       = get_or_set('private_message_recipient');

// *Synchronously* check if a stream exists.
exports.check_stream_existence = function (stream_name) {
    var result = "error";
    $.ajax({
        type: "POST",
        url: "/json/subscriptions/exists",
        data: {'stream': stream_name},
        async: false,
        success: function (data) {
            if (data.subscribed) {
                result = "subscribed";
            } else {
                result = "not-subscribed";
            }
        },
        error: function (xhr) {
            if (xhr.status === 404) {
                result = "does-not-exist";
            } else {
                result = "error";
            }
        }
    });
    return result;
};


// Checks if a stream exists. If not, displays an error and returns
// false.
function check_stream_for_send(stream_name) {
    var result = exports.check_stream_existence(stream_name);

    if (result === "error") {
        compose_error("Error checking subscription", $("#stream"));
        $("#compose-send-button").removeAttr('disabled');
        $("#sending-indicator").hide();
    }

    return result;
}

function validate_stream_message() {
    var stream_name = exports.stream_name();
    if (stream_name === "") {
        compose_error("Please specify a stream", $("#stream"));
        return false;
    }

    var response;

    if (!subs.is_subscribed(stream_name)) {
        switch(check_stream_for_send(stream_name)) {
        case "does-not-exist":
            response = "<p>The stream <b>" +
                Handlebars.Utils.escapeExpression(stream_name) + "</b> does not exist.</p>" +
                "<p>Manage your subscriptions <a href='#subscriptions'>on your Streams page</a>.</p>";
            compose_error(response, $('#stream'));
            return false;
        case "error":
            return false;
        case "subscribed":
            // You're actually subscribed to the stream, but this
            // browser window doesn't know it.
            return true;
        case "not-subscribed":
            response = "<p>You're not subscribed to the stream <b>" +
                Handlebars.Utils.escapeExpression(stream_name) + "</b>.</p>" +
                "<p>Manage your subscriptions <a href='#subscriptions'>on your Streams page</a>.</p>";
            compose_error(response, $('#stream'));
            return false;
        }
    }

    return true;
}

function validate_private_message() {
    if (exports.recipient() === "") {
        compose_error("Please specify at least one recipient", $("#private_message_recipient"));
        return false;
    }

    return true;
}

exports.validate = function () {
    $("#compose-send-button").attr('disabled', 'disabled').blur();
    $("#sending-indicator").show();

    if (exports.message_content() === "") {
        compose_error("You have nothing to send!", $("#new_message_content"));
        return false;
    }

    if (exports.composing() === 'private') {
        return validate_private_message();
    } else {
        return validate_stream_message();
    }
};

$(function () {
    $("#new_message_content").autosize();

    $("#new_message_content").focus(function (e) {
        // If we click in the composebox, start up a new message
        if (!compose.composing()) {
            if (narrow.narrowed_to_pms()) {
                compose.start('private');
            } else {
                compose.start('stream');
            }
            e.stopPropagation();
        }
    });

    $("#compose").filedrop({
        url: "json/upload_file",
        fallback_id: "file_input",
        paramname: "file",
        maxfilesize: 25,
        data: {
            // the token isn't automatically included in filedrop's post
            csrfmiddlewaretoken: csrf_token
        },
        raw_droppable: ['text/uri-list', 'text/plain'],
        drop: function (i, file, len) {
            $("#compose-send-button").attr("disabled", "");
            $("#send-status").addClass("alert-info")
                             .show();
            $(".send-status-close").one('click', abort_xhr);
            $("#error-msg").html(
                $("<p>").text("Uploading…")
                        .after('<div class="progress progress-striped active">' +
                               '<div class="bar" id="upload-bar" style="width: 00%;"></div>' +
                               '</div>'));
        },
        progressUpdated: function (i, file, progress) {
            $("#upload-bar").width(progress + "%");
        },
        error: function (err, file) {
            var msg;
            $("#send-status").addClass("alert-error")
                            .removeClass("alert-info");
            $("#compose-send-button").removeAttr("disabled");
            switch(err) {
                case 'BrowserNotSupported':
                    msg = "File upload is not yet available for your browser.";
                    break;
                case 'TooManyFiles':
                    msg = "Unable to upload that many files at once.";
                    break;
                case 'FileTooLarge':
                    // sanitizatio not needed as the file name is not potentially parsed as HTML, etc.
                    msg = "\"" + file.name + "\" was too large; the maximum file size is 25MiB.";
                    break;
                case 'REQUEST ENTITY TOO LARGE':
                    msg = "Sorry, the file was too large.";
                    break;
                default:
                    msg = "An unknown error occured.";
                    break;
            }
            $("#error-msg").text(msg);
        },
        uploadFinished: function (i, file, response, time) {
            if (response.uri === undefined) {
                return;
            }
            var textbox = $("#new_message_content"),
                split_uri = response.uri.split("/"),
                filename = split_uri[split_uri.length - 1];
            // Urgh, yet another hack to make sure we're "composing"
            // when text gets added into the composebox.
            if (!compose.composing()) {
                compose.start('stream');
            }
            if (i === -1) {
                // This is a paste, so there's no filename. Show the image directly
                textbox.val(textbox.val() + "[pasted image](" + response.uri + ") ");
            } else {
                // This is a dropped file, so make the filename a link to the image
                textbox.val(textbox.val() + "[" + filename + "](" + response.uri + ")" + " ");
            }
            $("#new_message_content").trigger("autosize");
            $("#compose-send-button").removeAttr("disabled");
            $("#send-status").removeClass("alert-info")
                             .hide();

            // In order to upload the same file twice in a row, we need to clear out
            // the #file_input element, so that the next time we use the file dialog,
            // an actual change event is fired.  This is extracted to a function
            // to abstract away some IE hacks.
            clear_out_file_list($("#file_input"));
        },
        rawDrop: function (contents) {
            var textbox = $("#new_message_content");
            if (!compose.composing()) {
                compose.start('stream');
            }
            textbox.val(textbox.val() + contents);
        }
    });
});

return exports;

}());
