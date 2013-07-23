var ui = (function () {

var exports = {};

var actively_scrolling = false;

exports.actively_scrolling = function () {
    return actively_scrolling;
};

// What, if anything, obscures the home tab?
exports.home_tab_obscured = function () {
    if ($('.modal:visible').length > 0)
        return 'modal';
    if (! $('#home').hasClass('active'))
        return 'other_tab';
    return false;
};

// We want to remember how far we were scrolled on each 'tab'.
// To do so, we need to save away the old position of the
// scrollbar when we switch to a new tab (and restore it
// when we switch back.)
var scroll_positions = {};
var gravatar_stamp = 1;

exports.change_tab_to = function (tabname) {
    $('#gear-menu a[href="' + tabname + '"]').tab('show');
};

exports.focus_on = function (field_id) {
    // Call after autocompleting on a field, to advance the focus to
    // the next input field.

    // Bootstrap's typeahead does not expose a callback for when an
    // autocomplete selection has been made, so we have to do this
    // manually.
    $("#" + field_id).focus();
};

function amount_to_paginate() {
    // Some day we might have separate versions of this function
    // for Page Up vs. Page Down, but for now it's the same
    // strategy in either direction.
    var info = viewport.message_viewport_info();
    var page_size = info.visible_height;

    // We don't want to page up a full page, because Humbug users
    // are especially worried about missing messages, so we want
    // a little bit of the old page to stay on the screen.  The
    // value chosen here is roughly 2 or 3 lines of text, but there
    // is nothing sacred about it, and somebody more anal than me
    // might wish to tie this to the size of some particular DOM
    // element.
    var overlap_amount = 55;

    var delta = page_size - overlap_amount;

    // If the user has shrunk their browser a whole lot, pagination
    // is not going to be very pleasant, but we can at least
    // ensure they go in the right direction.
    if (delta < 1) delta = 1;

    return delta;
}

exports.page_up_the_right_amount = function () {
    // This function's job is to scroll up the right amount,
    // after the user hits Page Up.  We do this ourselves
    // because we can't rely on the browser to account for certain
    // page elements, like the compose box, that sit in fixed
    // positions above the message pane.  For other scrolling
    // related adjustements, try to make those happen in the
    // scroll handlers, not here.
    var delta = amount_to_paginate();
    viewport.scrollTop(viewport.scrollTop() - delta);
};

exports.page_down_the_right_amount = function () {
    // see also: page_up_the_right_amount
    var delta = amount_to_paginate();
    viewport.scrollTop(viewport.scrollTop() + delta);
};

function find_boundary_tr(initial_tr, iterate_row) {
    var j, skip_same_td_check = false;
    var tr = initial_tr;

    // If the selection boundary is somewhere that does not have a
    // parent tr, we should let the browser handle the copy-paste
    // entirely on its own
    if (tr.length === 0) {
        return undefined;
    }

    // If the selection bounary is on a table row that does not have an
    // associated message id (because the user clicked between messages),
    // then scan downwards until we hit a table row with a message id.
    // To ensure we can't enter an infinite loop, bail out (and let the
    // browser handle the copy-paste on its own) if we don't hit what we
    // are looking for within 10 rows.
    for (j = 0; (!tr.is('.message_row')) && j < 10; j++) {
        tr = iterate_row(tr);
    }
    if (j === 10) {
        return undefined;
    } else if (j !== 0) {
        // If we updated tr, then we are not dealing with a selection
        // that is entirely within one td, and we can skip the same td
        // check (In fact, we need to because it won't work correctly
        // in this case)
        skip_same_td_check = true;
    }
    return [rows.id(tr), skip_same_td_check];
}

exports.replace_emoji_with_text = function (element) {
    element.find(".emoji").replaceWith(function () {
        return $(this).attr("alt");
    });
};

function copy_handler(e) {
    var selection = window.getSelection();
    var i, range, ranges = [], startc, endc, initial_end_tr, start_id, end_id, row, message;
    var start_data, end_data;
    var skip_same_td_check = false;
    var div = $('<div>'), content;
    for (i = 0; i < selection.rangeCount; i++) {
        range = selection.getRangeAt(i);
        ranges.push(range);

        startc = $(range.startContainer);
        start_data = find_boundary_tr($(startc.parents('tr')[0]), function (row) {
            return row.next();
        });
        if (start_data === undefined) {
            return;
        }
        start_id = start_data[0];

        endc = $(range.endContainer);
        // If the selection ends in the bottom whitespace, we should act as
        // though the selection ends on the final message
        if (endc.attr('id') === "bottom_whitespace") {
            initial_end_tr = $("tr.message_row:last");
            skip_same_td_check = true;
        } else {
            initial_end_tr = $(endc.parents('tr')[0]);
        }
        end_data = find_boundary_tr(initial_end_tr, function (row) {
            return row.prev();
        });
        if (end_data === undefined) {
            return;
        }
        end_id = end_data[0];

        if (start_data[1] || end_data[1]) {
            skip_same_td_check = true;
        }

        // If the selection starts and ends in the same td,
        // we want to let the browser handle the copy-paste mostly on its own
        if (!skip_same_td_check &&
            startc.parents('td')[0] === endc.parents('td')[0]) {

            // If the user is not running the desktop app, let the browser handle
            // the copy entirely on its own
            if (window.bridge === undefined) {
                return;
            }

            // If the user is running the desktop app, we still create "div"
            // so that we can replace emoji with their text
            div.append(range.cloneContents());
        }
        else {

            // Construct a div for what we want to copy (div)
            for (row = rows.get(start_id, current_msg_list.table_name);
                 rows.id(row) <= end_id;
                 row = rows.next_visible(row))
            {
                if (row.prev().hasClass("recipient_row")) {
                    content = $('<div>').text(row.prev().children(".right_part").text()
                                                .replace(/\s+/g, " ")
                                                .replace(/^\s/, "").replace(/\s$/, ""));
                    div.append($('<p>').append($('<strong>').text(content.text())));
                }

                message = current_msg_list.get(rows.id(row));

                var message_firstp = $(message.content).slice(0, 1);
                message_firstp.prepend(message.sender_full_name + ": ");
                div.append(message_firstp);
                div.append($(message.content).slice(1));
            }
        }
    }

    if (window.bridge !== undefined) {
        // If the user is running the desktop app,
        // convert emoji images to plain text for
        // copy-paste purposes.
        exports.replace_emoji_with_text(div);
    }

    // Select div so that the browser will copy it
    // instead of copying the original selection
    div.css({position: 'absolute', 'left': '-99999px'})
            .attr('id', 'copytempdiv');
    $('body').append(div);
    selection.selectAllChildren(div[0]);

    // After the copy has happened, delete the div and
    // change the selection back to the original selection
    window.setTimeout(function () {
        selection = window.getSelection();
        selection.removeAllRanges();
        $.each(ranges, function (index, range) {
            selection.addRange(range);
        });
        $('#copytempdiv').remove();
    },0);
}

$(function () {
    $(document).bind('copy', copy_handler);
});

/* We use 'visibility' rather than 'display' and jQuery's show() / hide(),
   because we want to reserve space for the email address.  This avoids
   things jumping around slightly when the email address is shown. */

var current_message_hover;
function message_unhover() {
    if (current_message_hover === undefined)
        return;
    current_message_hover.removeClass('message_hovered');
    current_message_hover = undefined;
}

function message_hover(message_row) {
    message_unhover();
    message_row.addClass('message_hovered');
    current_message_hover = message_row;
}

exports.report_message = function (response, status_box, cls) {
    if (cls === undefined)
        cls = 'alert';

    status_box.removeClass(status_classes).addClass(cls)
              .text(response).stop(true).fadeTo(0, 1);
    status_box.show();
};

exports.report_error = function (response, xhr, status_box) {
    if (xhr.status.toString().charAt(0) === "4") {
        // Only display the error response for 4XX, where we've crafted
        // a nice response.
        response += ": " + $.parseJSON(xhr.responseText).msg;
    }

    ui.report_message(response, status_box, 'alert-error');
};

exports.report_success = function (response, status_box) {
    ui.report_message(response, status_box, 'alert-success');
};

var clicking = false;
var mouse_moved = false;

function mousedown() {
    mouse_moved = false;
    clicking = true;
}

function mousemove() {
    if (clicking) {
        mouse_moved = true;
    }
}

function need_skinny_mode() {
    if (window.matchMedia !== undefined) {
        return window.matchMedia("(max-width: 767px)").matches;
    } else {
        // IE<10 doesn't support window.matchMedia, so do this
        // as best we can without it.
        return window.innerWidth <= 767;
    }
}

function get_new_heights() {
    var res = {};
    var viewport_height = viewport.height();
    var top_navbar_height = $("#top_navbar").height();

    res.bottom_whitespace_height = viewport_height * 0.4;

    res.main_div_min_height = viewport_height - top_navbar_height;

    res.bottom_sidebar_height = viewport_height - top_navbar_height
        - $(".upper_sidebar").height()
        - 40;

    res.right_sidebar_height =
        viewport_height - top_navbar_height
        - $("#notifications-area").height()
        - 14  // margin for right sidebar
        - 10; // padding on notifications bar

    res.stream_filters_max_height =
        res.bottom_sidebar_height * 0.75;

    res.user_presences_max_height =
        res.right_sidebar_height * 0.90;

    return res;
}

function resizehandler(e) {
    var composebox = $("#compose");
    var floating_recipient_bar = $("#floating_recipient_bar");
    var tab_bar = $("#tab_bar");
    var tab_bar_under = $("#tab_bar_underpadding");
    var desired_width;
    if (exports.home_tab_obscured() === 'other_tab') {
        desired_width = $("div.tab-pane.active").outerWidth();
    } else {
        desired_width = $("#main_div").outerWidth();
    }
    composebox.width(desired_width);
    floating_recipient_bar.width(desired_width);
    tab_bar.width(desired_width);
    tab_bar_under.width(desired_width);

    var h = get_new_heights();

    $("#bottom_whitespace").height(h.bottom_whitespace_height);
    $("#main_div").css('min-height', h.main_div_min_height);
    $(".bottom_sidebar").height(h.bottom_sidebar_height);
    $("#right-sidebar").height(h.right_sidebar_height);
    $("#stream_filters").css('max-height', h.stream_filters_max_height);
    $("#user_presences").css('max-height', h.user_presences_max_height);

    // This function might run onReady (if we're in a narrow window),
    // but before we've loaded in the messages; in that case, don't
    // try to scroll to one.
    if (current_msg_list.selected_id() !== -1) {
        scroll_to_selected();
    }

    // When the screen resizes, it can make it so that messages are
    // now on the page, so we need to update the notifications bar.
    // We may want to do more here in terms of updating unread counts,
    // but it's possible that resize events can happen as part of
    // screen resolution changes, so we might want to wait for a more
    // intentional action to say that the user has "read" a message.
    var res = unread.get_counts();
    notifications_bar.update(res.home_unread_messages);
}

$(function () {
    // When the user's profile picture loads this can change the height of the sidebar
    $("img.gravatar-profile").bind('load', resizehandler);
});

var is_floating_recipient_bar_showing = false;

function show_floating_recipient_bar() {
    if (!is_floating_recipient_bar_showing) {
        $("#floating_recipient_bar").css('visibility', 'visible');
        is_floating_recipient_bar_showing = true;
    }
}

var old_label;
function replace_floating_recipient_bar(desired_label) {
    var new_label, other_label, header;
    if (desired_label !== old_label) {
        if (desired_label.children(".message_header_stream").length !== 0) {
            new_label = $("#current_label_stream");
            other_label = $("#current_label_private_message");
            header = desired_label.children(".message_header_stream.right_part");

            $("#current_label_stream td:first").css(
                "background-color",
                desired_label.children(".message_header_colorblock")
                             .css("background-color"));
        } else {
            new_label = $("#current_label_private_message");
            other_label = $("#current_label_stream");
            header = desired_label.children(".message_header_private_message.right_part");
        }
        new_label.find("td:last").replaceWith(header.clone());
        other_label.css('display', 'none');
        new_label.css('display', 'table-row');
        new_label.attr("zid", rows.id(desired_label));

        old_label = desired_label;
    }
    show_floating_recipient_bar();
}

function hide_floating_recipient_bar() {
    if (is_floating_recipient_bar_showing) {
        $("#floating_recipient_bar").css('visibility', 'hidden');
        is_floating_recipient_bar_showing = false;
    }
}

exports.update_floating_recipient_bar = function () {
    var floating_recipient_bar = $("#floating_recipient_bar");
    var floating_recipient_bar_top = floating_recipient_bar.offset().top;
    var floating_recipient_bar_bottom = floating_recipient_bar_top + floating_recipient_bar.outerHeight();

    // Find the last message where the top of the recipient
    // row is at least partially occluded by our box.
    // Start with the pointer's current location.
    var candidate = current_msg_list.selected_row();
    if (candidate === undefined) {
        return;
    }
    while (true) {
        candidate = candidate.prev();
        if (candidate.length === 0) {
            // We're at the top of the page and no labels are above us.
            hide_floating_recipient_bar();
            return;
        }
        if (candidate.is(".focused_table .recipient_row")) {
            if (candidate.offset().top < floating_recipient_bar_bottom) {
                break;
            }
        }
    }
    var current_label = candidate;

    // We now know what the floating stream/subject bar should say.
    // Do we show it?

    // Hide if the bottom of our floating stream/subject label is not
    // lower than the bottom of current_label (since that means we're
    // covering up a label that already exists).
    if (floating_recipient_bar_bottom <=
        (current_label.offset().top + current_label.outerHeight())) {
        hide_floating_recipient_bar();
        return;
    }

    // Hide if the message is faded
    if (current_label.hasClass('message_reply_fade')
     || current_label.hasClass('message_reply_fade_narrowed')) {
        hide_floating_recipient_bar();
        return;
    }

    // Hide if our bottom is in our bookend (or one bookend-height
    // above it). This means we're not showing any useful part of the
    // message above us, so why bother showing the label?
    var current_bookend = current_label.nextUntil(".bookend_tr")
                                       .andSelf()
                                       .next(".bookend_tr:first");
    // (The last message currently doesn't have a bookend, which is why this might be 0).
    if (current_bookend.length > 0) {
        if (floating_recipient_bar_bottom >
            (current_bookend.offset().top - current_bookend.outerHeight())) {
            hide_floating_recipient_bar();
            return;
        }
    }

    replace_floating_recipient_bar(current_label);
};

function hack_for_floating_recipient_bar() {
    // So, as of this writing, Firefox respects visibility: collapse,
    // but WebKit does not (at least, my Chrome doesn't.)  Instead it
    // renders it basically as visibility: hidden, which leaves a
    // slight gap that our messages peek through as they scroll
    // by. This hack fixes this by programmatically measuring how big
    // the gap is, and then moving our table up to compensate.
    var gap = $("#floating_recipient_layout_row").outerHeight(true);
    var floating_recipient = $(".floating_recipient");
    var offset = floating_recipient.offset();
    offset.top = offset.top - gap;
    floating_recipient.offset(offset);
}

function update_message_flag(message, flag_name, set_flag) {
    $.ajax({
        type: 'POST',
        url: '/json/update_message_flags',
        data: {messages: JSON.stringify([message.id]),
               op: set_flag ? 'add' : 'remove',
               flag: flag_name},
        dataType: 'json'});
}

function change_message_collapse(message, collapsed) {
    update_message_flag(message, "collapsed", collapsed);
}

function change_message_star(message, starred) {
    update_message_flag(message, "starred", starred);
}

function toggle_star(row_id) {
    // Update the message object pointed to by the various message
    // lists.
    var message = current_msg_list.get(row_id);

    mark_message_as_read(message);

    if (message.starred === true) {
        message.starred = false;
    } else {
        message.starred = true;
    }

    // Avoid a full re-render, but update the star in each message
    // table in which it is visible.
    $.each([all_msg_list, home_msg_list, narrowed_msg_list], function () {
        if (this === undefined) {
            return;
        }
        var row = rows.get(row_id, this.table_name);
        if (row === undefined) {
            // The row may not exist, e.g. if you star a message in the all
            // messages table from a stream that isn't in your home view.
            return;
        }
        var favorite_image = row.find(".message_star");
        favorite_image.toggleClass("empty-star");
        var title_state = message.starred ? "Unstar" : "Star";
        favorite_image.attr("title", title_state + " this message");
    });

    // Save the star change.
    change_message_star(message, message.starred);
}

function update_gravatars() {
    $.each($(".gravatar-profile"), function (index, profile) {
        // Avatar URLs will have at least one param, so & is safe here.
        $(this).attr('src', $(this).attr('src') + '&stamp=' + gravatar_stamp);
    });
    gravatar_stamp += 1;
}

function poll_for_gravatar_update(start_time, url) {
    // Give users 5 minutes to update their picture on gravatar.com,
    // during which we try to auto-update their image on our site. If
    // they take longer than that, we'll update when they press the
    // save button.
    $.ajax({
        type: "HEAD",
        url: url,
        async: false,
        cache: false,
        success: function (resp, statusText, xhr) {
            if (new Date(xhr.getResponseHeader('Last-Modified')) > start_time) {
                update_gravatars();
            }
            else {
                if (($.now() - start_time) < 1000 * 60 * 5) {
                    setTimeout(function () {
                        poll_for_gravatar_update(start_time, url);
                    }, 1500);
                }
            }
        }
    });

}

exports.small_avatar_url = function (message) {
    // Try to call this function in all places where we need size-30
    // quality gravatar images, so that the browser can help
    // us avoid unnecessary network trips.  (For user-uploaded avatars,
    // the s=30 parameter is essentially ignored, but it's harmless.)
    //
    if (message.avatar_url) {
        var url = message.avatar_url + "&s=30";
        if (message.sent_by_me) {
            url += "&stamp=" + gravatar_stamp;
        }
        return url;
    } else {
        return "";
    }
};

exports.wait_for_gravatar = function () {
    poll_for_gravatar_update($.now(), $(".gravatar-profile").attr("src"));
};

var loading_more_messages_indicator_showing = false;
exports.show_loading_more_messages_indicator = function () {
    if (! loading_more_messages_indicator_showing) {
        util.make_loading_indicator($('#loading_more_messages_indicator'),
                                    {abs_positioned: true});
        loading_more_messages_indicator_showing = true;
        hide_floating_recipient_bar();
    }
};

exports.hide_loading_more_messages_indicator = function () {
    if (loading_more_messages_indicator_showing) {
        util.destroy_loading_indicator($("#loading_more_messages_indicator"));
        loading_more_messages_indicator_showing = false;
    }
};

function could_be_condensed(elem) {
    return elem.getBoundingClientRect().height > viewport.height() * 0.65;
}

function show_more_link(row) {
    row.find(".message_condenser").hide();
    row.find(".message_expander").show();
}

function show_condense_link(row) {
    row.find(".message_expander").hide();
    row.find(".message_condenser").show();
}

function condense(row) {
    var content = row.find(".message_content");
    content.addClass("condensed");
    show_more_link(row);
}

function uncondense(row) {
    var content = row.find(".message_content");
    content.removeClass("condensed");
    show_condense_link(row);
}

exports.uncollapse = function (row) {
    // Uncollapse a message, restoring the condensed message [More] or
    // [Condense] link if necessary.
    var message = current_msg_list.get(rows.id(row));
    var content = row.find(".message_content");
    message.collapsed = false;
    content.removeClass("collapsed");
    change_message_collapse(message, false);

    if (message.condensed === true) {
        // This message was condensed by the user, so re-show the
        // [More] link.
        condense(row);
    } else if (message.condensed === false) {
        // This message was un-condensed by the user, so re-show the
        // [Condense] link.
        uncondense(row);
    } else if (content.hasClass("could-be-condensed")) {
        // By default, condense a long message.
        condense(row);
    } else {
        // This was a short message, no more need for a [More] link.
        row.find(".message_expander").hide();
    }
};

exports.collapse = function (row) {
    // Collapse a message, hiding the condensed message [More] or
    // [Condense] link if necessary.
    var message = current_msg_list.get(rows.id(row));
    message.collapsed = true;
    change_message_collapse(message, true);
    row.find(".message_content").addClass("collapsed");
    show_more_link(row);
};

$(function () {
    // NB: This just binds to current elements, and won't bind to elements
    // created after ready() is called.
    $('#send-status .send-status-close').click(
        function () { $('#send-status').stop(true).fadeOut(500); }
    );

    var scroll_start_message;

    function scroll_finished() {
        actively_scrolling = false;

        if ($('#home').hasClass('active')) {
            if (!suppress_scroll_pointer_update) {
                keep_pointer_in_view();
            } else {
                suppress_scroll_pointer_update = false;
            }
            exports.update_floating_recipient_bar();
            if (viewport.scrollTop() === 0 &&
                have_scrolled_away_from_top) {
                have_scrolled_away_from_top = false;
                load_more_messages(current_msg_list);
            } else if (!have_scrolled_away_from_top) {
                have_scrolled_away_from_top = true;
            }
            // When the window scrolls, it may cause some messages to
            // enter the screen and become read.  Calling
            // process_visible_unread_messages will update necessary
            // data structures and DOM elements.
            setTimeout(process_visible_unread_messages, 0);
        }
    }

    var scroll_timer;
    function scroll_finish() {
        actively_scrolling = true;
        clearTimeout(scroll_timer);
        scroll_timer = setTimeout(scroll_finished, 100);
    }

    $(window).scroll($.throttle(50, function (e) {
        process_visible_unread_messages();
        scroll_finish();
    }));

    var throttled_mousewheelhandler = $.throttle(50, function (e, delta) {
        // Most of the mouse wheel's work will be handled by the
        // scroll handler, but when we're at the top or bottom of the
        // page, the pointer may still need to move.
        move_pointer_at_page_top_and_bottom(delta);
        last_viewport_movement_direction = delta;
    });

    $(window).mousewheel(function (e, delta) {
        // Ignore mousewheel events if a modal is visible.  It's weird if the
        // user can scroll the main view by wheeling over the greyed-out area.
        // Similarly, ignore events on settings page etc.
        //
        // We don't handle the compose box here, because it *should* work to
        // select the compose box and then wheel over the message stream.
        var obscured = exports.home_tab_obscured();
        if (!obscured) {
            throttled_mousewheelhandler(e, delta);
        } else if (obscured === 'modal') {
            // The modal itself has a handler invoked before this one (see below).
            // preventDefault here so that the tab behind the modal doesn't scroll.
            //
            // This needs to include the events that would be ignored by throttling.
            // That's why this code can't be moved into throttled_mousewheelhandler.
            e.preventDefault();
        }
        // If on another tab, we neither handle the event nor preventDefault, allowing
        // the tab to scroll normally.
    });

    $(window).resize($.throttle(50, resizehandler));

    // Scrolling in modals, input boxes, and other elements that
    // explicitly scroll should not scroll the main view.  Stop
    // propagation in all cases.  Also, ignore the event if the
    // element is already at the top or bottom.  Otherwise we get a
    // new scroll event on the parent (?).
    $('.modal-body, .scrolling_list, input, textarea').mousewheel(function (e, delta) {
        var self = $(this);
        var scroll = self.scrollTop();
        e.stopPropagation();
        if (   ((delta > 0) && (scroll <= 0))
            || ((delta < 0) && (scroll >= (this.scrollHeight - self.innerHeight())))) {
            e.preventDefault();
        }
    });

    // Ignore wheel events in the compose area which weren't already handled above.
    $('#compose').mousewheel(function (e) {
        e.stopPropagation();
        e.preventDefault();
    });

    function clear_password_change() {
        // Clear the password boxes so that passwords don't linger in the DOM
        // for an XSS attacker to find.
        $('#old_password, #new_password, #confirm_password').val('');
    }

    // So, this is a rather inelegant hack that addresses two issues.
    //
    // The first issue goes something like this: we use Bootstrap's
    // notion of tabs to show what pane you're in.  Bootstrap likes to
    // highlight the active tab. Since "Settings", etc. are in our
    // dropdown, therefore the dropdown is the "active" tab, so we
    // draw it as though it is pushed in! However, this is
    // inappropriate for what we're trying to do.  (we're trying to
    // give you a menu, not indicate where you are; and undoing this
    // and doing all the tab work by hand is just unnecessarily
    // painful.)
    //
    // So to get around this, we take away the "active" status of
    // gear-menu every single time a tab is shown.
    $('#gear-menu a[data-toggle="tab"]').on('shown', function (e) {
        $('#gear-menu').removeClass('active');
    });
    // Doing so ends up causing some other problem, though, where the
    // little 'active' indicators get stuck on the menu sub-items, so
    // we need to flush the old ones too once a new one is
    // activated. (Otherwise, once you've been to a tab you can never
    // go to it again).
    //
    // Incidentally, this also fixes a problem we have with
    // e.relatedTarget; if you don't do the clearing as specified
    // above, e.relatedTarget always ends up being the last link in
    // our dropdown, as opposed to "the previously selected menu
    // item."
    $('#gear-menu a[data-toggle="tab"]').on('show', function (e) {
        $('#gear-menu li').removeClass('active');
    });

    $('#gear-menu a[data-toggle="tab"]').on('show', function (e) {
        // Save the position of our old tab away, before we switch
        var old_tab = $(e.relatedTarget).attr('href');
        scroll_positions[old_tab] = viewport.scrollTop();
    });
    $('#gear-menu a[data-toggle="tab"]').on('shown', function (e) {
        var target_tab = $(e.target).attr('href');

        // Hide all our error messages when switching tabs
        $('.alert-error').hide();
        $('.alert-success').hide();
        $('.alert-info').hide();
        $('.alert').hide();

        $("#api_key_value").text("");
        $("#get_api_key_box").hide();
        $("#show_api_key_box").hide();
        $("#api_key_button_box").show();

        clear_password_change();

        // Set the URL bar title to show the sub-page you're currently on.
        var browser_url = target_tab;
        if (browser_url === "#home") {
            browser_url = "";
        }
        hashchange.changehash(browser_url);

        // After we show the new tab, restore its old scroll position
        // (we apparently have to do this after setting the hash,
        // because otherwise that action may scroll us somewhere.)
        if (scroll_positions.hasOwnProperty(target_tab)) {
            viewport.scrollTop(scroll_positions[target_tab]);
        } else {
            if (target_tab === '#home') {
                scroll_to_selected();
            } else {
                viewport.scrollTop(0);
            }
        }
    });

    var subs_link = $('#gear-menu a[href="#subscriptions"]');

    // If the streams page is shown by clicking directly on the "Streams"
    // link (in the gear menu), then focus the new stream textbox.
    subs_link.on('click', function (e) {
        $(document).one('subs_page_loaded.zephyr', function (e) {
            $('#create_stream_name').focus().select();
        });
    });

    // Whenever the streams page comes up (from anywhere), populate it.
    subs_link.on('shown', subs.setup_page);

    $('#pw_change_link').on('click', function (e) {
        e.preventDefault();
        $('#pw_change_link').hide();
        $('#pw_change_controls').show();
    });

    $('#new_password').on('change keyup', function () {
        password_quality($('#new_password').val(), $('#pw_strength .bar'));
    });

    var settings_status = $('#settings-status');

    function settings_change_error(message) {
        // Scroll to the top so the error message is visible.
        // We would scroll anyway if we end up submitting the form.
        viewport.scrollTop(0);
        settings_status.removeClass(status_classes)
            .addClass('alert-error')
            .text(message).stop(true).fadeTo(0,1);
    }

    $("#settings-change-box form").ajaxForm({
        dataType: 'json', // This seems to be ignored. We still get back an xhr.
        beforeSubmit: function (arr, form, options) {
            // FIXME: Check that the two password fields match
            // FIXME: Use the same jQuery validation plugin as the signup form?
            var new_pw = $('#new_password').val();
            if (new_pw !== '') {
                var password_ok = password_quality(new_pw);
                if (password_ok === undefined) {
                    // zxcvbn.js didn't load, for whatever reason.
                    settings_change_error(
                        'An internal error occurred; try reloading the page. ' +
                        'Sorry for the trouble!');
                    return false;
                } else if (!password_ok) {
                    settings_change_error('New password is too weak');
                    return false;
                }
            }
            return true;
        },
        success: function (resp, statusText, xhr, form) {
            var message = "Updated settings!";
            var result = $.parseJSON(xhr.responseText);

            if (result.full_name !== undefined) {
                $(".my_fullname").text(result.full_name);
            }
            update_gravatars();

            if (result.enable_desktop_notifications !== undefined) {
                page_params.desktop_notifications_enabled = result.enable_desktop_notifications;
            }
            if (result.enable_sounds !== undefined) {
                page_params.sounds_enabled = result.enable_sounds;
            }

            if (result.enable_offline_email_notifications !== undefined) {
                page_params.enable_offline_email_notifications = result.enable_offline_email_notifications;
            }

            settings_status.removeClass(status_classes)
                .addClass('alert-success')
                .text(message).stop(true).fadeTo(0,1);
            // TODO: In theory we should auto-reload or something if
            // you changed the email address or other fields that show
            // up on all screens
        },
        error: function (xhr, error_type, xhn) {
            var response = "Error changing settings";
            if (xhr.status.toString().charAt(0) === "4") {
                // Only display the error response for 4XX, where we've crafted
                // a nice response.
                response += ": " + $.parseJSON(xhr.responseText).msg;
            }
            settings_change_error(response);
        },
        complete: function (xhr, statusText) {
            // Whether successful or not, clear the password boxes.
            // TODO: Clear these earlier, while the request is still pending.
            clear_password_change();
        }
    });

    $("#get_api_key_box").hide();
    $("#show_api_key_box").hide();
    $("#get_api_key_box form").ajaxForm({
        dataType: 'json', // This seems to be ignored. We still get back an xhr.
        success: function (resp, statusText, xhr, form) {
            var message = "Updated settings!";
            var result = $.parseJSON(xhr.responseText);
            $("#get_api_key_password").val("");
            $("#api_key_value").text(result.api_key);
            $("#show_api_key_box").show();
            $("#get_api_key_box").hide();
            settings_status.hide();
        },
        error: function (xhr, error_type, xhn) {
            var response = "Error getting API key";
            if (xhr.status.toString().charAt(0) === "4") {
                // Only display the error response for 4XX, where we've crafted
                // a nice response.
                response += ": " + $.parseJSON(xhr.responseText).msg;
            }
            settings_status.removeClass(status_classes)
                .addClass('alert-error')
                .text(response).stop(true).fadeTo(0,1);
            $("#show_api_key_box").hide();
            $("#get_api_key_box").show();
        }
    });

    // A little hackish, because it doesn't seem to totally get us the
    // exact right width for the floating_recipient_bar and compose
    // box, but, close enough for now.
    resizehandler();
    hack_for_floating_recipient_bar();

    $("#main_div").on("click", ".messagebox", function (e) {
        var target = $(e.target);
        if (target.is("a") || target.is("img.message_inline_image") || target.is("img.twitter-avatar") ||
            target.is("div.message_length_controller") || target.is("textarea") || target.is("input")) {
            // If this click came from a hyperlink, don't trigger the
            // reply action.  The simple way of doing this is simply
            // to call e.stopPropagation() from within the link's
            // click handler.
            //
            // Unfortunately, on Firefox, this breaks Ctrl-click and
            // Shift-click, because those are (apparently) implemented
            // by adding an event listener on link clicks, and
            // stopPropagation prevents them from being called.
            return;
        }
        if (!(clicking && mouse_moved)) {
            // Was a click (not a click-and-drag).
            var row = $(this).closest(".message_row");
            var id = rows.id(row);

            if (message_edit.is_editing(id)) {
                // Clicks on a message being edited shouldn't trigger a reply.
                return;
            }

            current_msg_list.select_id(id);
            respond_to_cursor = true;
            respond_to_message({trigger: 'message click'});
            e.stopPropagation();
            popovers.hide_all();
        }
        mouse_moved = false;
        clicking = false;
    });

    $("#main_div").on("mousedown", ".messagebox", mousedown);
    $("#main_div").on("mousemove", ".messagebox", mousemove);
    $("#main_div").on("mouseover", ".message_row", function (e) {
        var row = $(this);
        message_hover(row);
    });

    $("#main_div").on("mouseout", ".message_row", function (e) {
        message_unhover();
    });

    $("#main_div").on("mouseover", ".message_sender", function (e) {
        var row = $(this).closest(".message_row");
        row.addClass("sender_name_hovered");
    });

    $("#main_div").on("mouseout", ".message_sender", function (e) {
        var row = $(this).closest(".message_row");
        row.removeClass("sender_name_hovered");
    });

    $("#main_div").on("click", ".star", function (e) {
        e.stopPropagation();
        popovers.hide_all();
        toggle_star(rows.id($(this).closest(".message_row")));
    });

    $("#home").on("click", ".message_expander", function (e) {
        // Expanding a message can mean either uncollapsing or
        // uncondensing it.
        var row = $(this).closest(".message_row");
        var message = current_msg_list.get(rows.id(row));
        var content = row.find(".message_content");
        if (message.collapsed) {
            // Uncollapse.
            ui.uncollapse(row);
        } else if (content.hasClass("could-be-condensed")) {
            // Uncondense (show the full long message).
            message.condensed = false;
            content.removeClass("condensed");
            $(this).hide();
            row.find(".message_condenser").show();
        }
    });

    $("#home").on("click", ".message_condenser", function (e) {
        var row = $(this).closest(".message_row");
        current_msg_list.get(rows.id(row)).condensed = true;
        condense(row);
    });

    $("#home").on("click", ".narrows_by_recipient", function (e) {
        var nearest = current_msg_list.get(rows.id($(this).closest(".recipient_row")));
        var selected = current_msg_list.selected_message();
        if (util.same_recipient(nearest, selected)) {
            narrow.by_recipient(selected.id, {trigger: 'message header'});
        } else {
            narrow.by_recipient(nearest.id, {trigger: 'message header'});
        }
    });

    $("#home").on("click", ".narrows_by_subject", function (e) {
        var nearest = current_msg_list.get(rows.id($(this).closest(".recipient_row")));
        var selected = current_msg_list.selected_message();
        if (util.same_recipient(nearest, selected)) {
            narrow.by_subject(selected.id, {trigger: 'message header'});
        } else {
            narrow.by_subject(nearest.id, {trigger: 'message header'});
        }
    });

    // Run a feature test and decide whether to display
    // the "Attach files" button

    if (window.XMLHttpRequest && (new XMLHttpRequest()).upload) {
        $("#compose #attach_files").removeClass("notdisplayed");
    }

    // Event bindings for "Compose" pane

    // Click event binding for "Attach files" button
    // Triggers a click on a hidden file input field

    $("#compose").on("click", "#attach_files", function (e) {
        e.preventDefault();
        $("#compose #file_input").trigger("click");
    } );

    $("#subscriptions_table").on("mouseover", ".subscription_header", function (e) {
        $(this).addClass("active");
    });

    $("#subscriptions_table").on("mouseout", ".subscription_header", function (e) {
        $(this).removeClass("active");
    });

    $("#stream").on('blur', function () { compose.decorate_stream_bar(this.value); });

    // Capture both the left-sidebar Home click and the tab breadcrumb Home
    $(document).on('click', "li[data-name='home']", function () {
        ui.change_tab_to('#home');
        narrow.deactivate();
        // We need to maybe scroll to the selected message
        // once we have the proper viewport set up
        setTimeout(maybe_scroll_to_selected, 0);
        return false;
    });

    $(".brand").on('click', function (e) {
        if (exports.home_tab_obscured()) {
            ui.change_tab_to('#home');
        } else {
            narrow.restore_home_state();
        }
        maybe_scroll_to_selected();
        e.preventDefault();
    });

    $(window).on('blur', function () {
        $(document.body).addClass('window_blurred');
    });

    $(window).on('focus', function () {
        $(document.body).removeClass('window_blurred');
    });

    $(document).on('message_selected.zephyr', function (event) {
        if (current_msg_list !== event.msg_list) {
            return;
        }
        if (event.id === -1) {
            // If the message list is empty, don't do anything
            return;
        }
        var row = rows.get(event.id, event.msg_list.table_name);
        $('.selected_message').removeClass('selected_message');
        row.addClass('selected_message');

        if (event.then_scroll) {
            // Scroll to place the message within the current view;
            // but if this is the initial placement of the pointer,
            // just place it in the very center
            recenter_view(row, {from_scroll: event.from_scroll,
                                force_center: event.previously_selected === -1});
        }
    });

    $("#main_div").on("mouseenter", ".message_time", function (e) {
        var time_elem = $(e.target);
        var row = time_elem.closest(".message_row");
        var message = current_msg_list.get(rows.id(row));
        timerender.set_full_datetime(message, time_elem);
    });

    $('#user_presences').on('click', 'a', function (e) {
        var email = $(e.target).closest('a').attr('data-email');
        narrow.by('pm-with', email, {trigger: 'presence list'});
        compose.start('private', {private_message_recipient: email,
                                  trigger: 'presence list'});
        // The preventDefault is necessary so that clicking the
        // link doesn't jump us to the top of the page.
        e.preventDefault();
        // The stopPropagation is necessary so that we don't
        // see the following sequence of events:
        // 1. This click "opens" the composebox
        // 2. This event propagates to the body, which says "oh, hey, the
        //    composebox is open and you clicked out of it, you must want to
        //    stop composing!"
        e.stopPropagation();
        // Since we're stopping propagation we have to manually close any
        // open popovers.
        popovers.hide_all();
    });

    $('#streams_inline_cog').tooltip({ placement: 'left',
                                       animation: false });

    $('#streams_header a').click(function (e) {
        exports.change_tab_to('#subscriptions');

        e.preventDefault();
    });

    $('#stream_filters li').on('click', 'a.subscription_name', function (e) {
        if (exports.home_tab_obscured()) {
            ui.change_tab_to('#home');
        }
        var stream = $(e.target).parents('li').attr('data-name');
        narrow.by('stream', stream, {select_first_unread: true, trigger: 'sidebar'});

        e.preventDefault();
    });

    popovers.register_click_handlers();

    $('#stream_filters').on('click', '.expanded_subject a', function (e) {
        if (exports.home_tab_obscured()) {
            ui.change_tab_to('#home');
        }
        var stream = $(e.target).parents('ul').attr('data-stream');
        var subject = $(e.target).parents('li').attr('data-name');

        narrow.activate([['stream',  stream],
                         ['topic', subject]],
                        {select_first_unread: true, trigger: 'sidebar'});

        e.preventDefault();
    });

    $('#stream_filters').on('click', '.streamlist_expand', function (e) {
        var stream_li = $(e.target).parents('li');

        $('ul.expanded_subjects', stream_li).toggleClass('hidden');

        return false;
    });

    $('.compose_stream_button').click(function (e) {
        compose.start('stream');
        return false;
    });
    $('.compose_private_button').click(function (e) {
        compose.start('private');
        return false;
    });

    $('.empty_feed_compose_stream').click(function (e) {
        compose.start('stream', {trigger: 'empty feed message'});
        return false;
    });
    $('.empty_feed_compose_private').click(function (e) {
        compose.start('private', {trigger: 'empty feed message'});
        return false;
    });
    $('.empty_feed_join').click(function (e) {
        subs.show_and_focus_on_narrow();
        return false;
    });

    // Keep these 2 feedback bot triggers separate because they have to
    // propagate the event differently.
    $('.feedback').click(function (e) {
        compose.start('private', { 'private_message_recipient': 'feedback@humbughq.com',
                                   trigger: 'feedback menu item' });

    });
    $('#feedback_button').click(function (e) {
        e.stopPropagation();
        popovers.hide_all();
        compose.start('private', { 'private_message_recipient': 'feedback@humbughq.com',
                                   trigger: 'feedback button' });

    });
    $('.logout_button').click(function (e) {
        $('#logout_form').submit();
    });
    $('.restart_get_updates_button').click(function (e) {
        restart_get_updates({dont_block: true});
    });

    $('#api_key_button').click(function (e) {
        $("#get_api_key_box").show();
        $("#api_key_button_box").hide();
    });
    $('.change_gravatar_button').click(function (e) {
        ui.wait_for_gravatar();
    });

    var notification_docs = $("#notification-docs");
    notification_docs.popover({"placement": "right",
                               "content": templates.render('notification_docs'),
                               "trigger": "manual"});
    $("body").on("mouseover", "#notification-docs", function (e) {
        notification_docs.popover('show');
        e.stopPropagation();
    });
    $("body").on("mouseout", "#notification-docs", function (e) {
        notification_docs.popover('hide');
        e.stopPropagation();
    });

    $('body').on('click', '.edit_subject', function (e) {
        var row = rows.get(rows.id($(this).closest(".recipient_row")),
                           current_msg_list.table_name);
        message_edit.start(row);
        e.stopPropagation();
        popovers.hide_all();
    });
    $("body").on("click", ".message_edit_save", function (e) {
        var row = $(this).closest(".message_row");
        message_edit.save(row);
        e.stopPropagation();
        popovers.hide_all();
    });
    $("body").on("click", ".message_edit_cancel", function (e) {
        var row = $(this).closest(".message_row");
        message_edit.end(row);
        e.stopPropagation();
        popovers.hide_all();
    });

    $("body").on('click', function (e) {
        // Dismiss popovers if the user has clicked outside them
        if ($('.popover-inner').has(e.target).length === 0) {
            popovers.hide_all();
        }

        // Unfocus our compose area if we click out of it. Don't let exits out
        // of modals or selecting text (for copy+paste) trigger cancelling.
        if (compose.composing() && !$(e.target).is("a") &&
            ($(e.target).closest(".modal").length === 0) &&
            window.getSelection().toString() === "") {
            compose.cancel();
        }
    });

    $("#compose").click(function (e) {
        // Don't let clicks in the compose area count as
        // "unfocusing" our compose -- in other words, e.g.
        // clicking "Press enter to send" should not
        // trigger the composebox-closing code above.
        // But do allow our formatting link.
        if (!$(e.target).is("a")) {
            e.stopPropagation();
        }
    });

    $("#compose_close").click(function (e) {
        compose.cancel();
    });

    $('#yes-bankrupt').click(function (e) {
        fast_forward_pointer();
        $("#yes-bankrupt").hide();
        $("#no-bankrupt").hide();
        $(this).after($("<div>").addClass("alert alert-info settings_committed")
               .text("Bringing you to your latest messages…"));
    });

    // initialize other stuff
    composebox_typeahead.initialize();
    search.initialize();
    notifications.initialize();
    hashchange.initialize();
    invite.initialize();
    activity.initialize();
    subs.maybe_toggle_all_messages();
    tutorial.initialize();
    onboarding.initialize();
});

var presence_descriptions = {
    active: ' is active',
    away:   ' was recently active',
    idle:   ' is not active'
};

exports.set_presence_list = function (users, presence_info) {
    if (page_params.domain === 'mit.edu')
        return;  // MIT realm doesn't have a presence list

    var my_info = {
        name: page_params.fullname,
        email: page_params.email,
        type: 'active',
        type_desc: presence_descriptions.active,
        my_fullname: true
    };

    function info_for(email) {
        var presence = presence_info[email];
        return {
            name: people_dict[email].full_name,
            email: email,
            type: presence,
            type_desc: presence_descriptions[presence]
        };
    }

    var user_emails = $.grep(users, function (email, idx) {
        return people_dict[email] !== undefined;
    });

    var user_info = [my_info].concat($.map(user_emails, info_for));

    $('#user_presences').html(templates.render('user_presence_rows', {users: user_info}));
};

// Save the compose content cursor position and restore when we
// shift-tab back in (see hotkey.js).
var saved_compose_cursor = 0;

$(function () {
    $('#new_message_content').blur(function () {
        saved_compose_cursor = $(this).caret().start;
    });
});

exports.restore_compose_cursor = function () {
    // Restore as both the start and end point, i.e.
    // nothing selected.
    $('#new_message_content')
        .focus()
        .caret(saved_compose_cursor, saved_compose_cursor);
};

exports.process_condensing = function (index, elem) {
    var content = $(elem).find(".message_content");
    var message = current_msg_list.get(rows.id($(elem)));
    if (content !== undefined && message !== undefined) {
        var long_message = could_be_condensed(elem);
        if (long_message) {
            // All long messages are flagged as such.
            content.addClass("could-be-condensed");
        }

        // If message.condensed is defined, then the user has manually
        // specified whether this message should be expanded or condensed.
        if (message.condensed === true) {
            condense($(elem));
            return;
        } else if (message.condensed === false) {
            uncondense($(elem));
            return;
        } else if (long_message) {
            // By default, condense a long message.
            condense($(elem));
        }

        // Completely hide the message and replace it with a [More]
        // link if the user has collapsed it.
        if (message.collapsed) {
            content.addClass("collapsed");
            $(elem).find(".message_expander").show();
        }
    }
};

return exports;
}());
