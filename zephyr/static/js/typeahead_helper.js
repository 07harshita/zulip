var typeahead_helper = (function () {

var exports = {};

var autocomplete_needs_update = false;
exports.autocomplete_needs_update = function (needs_update) {
    if (needs_update === undefined) {
        return autocomplete_needs_update;
    } else {
        autocomplete_needs_update = needs_update;
    }
};

exports.update_autocomplete = function () {
    search.update_typeahead();
    autocomplete_needs_update = false;
};

// Loosely based on Bootstrap's default highlighter, but with escaping added.
exports.highlight_with_escaping = function (query, item) {
    // query: The text currently in the searchbox
    // item: The string we are trying to appropriately highlight
    query = query.replace(/[\-\[\]{}()*+?.,\\\^$|#\s]/g, '\\$&');
    var regex = new RegExp('(' + query + ')', 'ig');
    // The result of the split will include the query term, because our regex
    // has parens in it.
    // (as per https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/String/split)
    // However, "not all browsers support this capability", so this is a place to look
    // if we have an issue here in, e.g. IE.
    var pieces = item.split(regex);
    // We need to assemble this manually (as opposed to doing 'join') because we need to
    // (1) escape all the pieces and (2) the regex is case-insensitive, and we need
    // to know the case of the content we're replacing (you can't just use a bolded
    // version of 'query')
    var result = "";
    $.each(pieces, function (idx, piece) {
        if (piece.match(regex)) {
            result += "<strong>" + Handlebars.Utils.escapeExpression(piece) + "</strong>";
        } else {
            result += Handlebars.Utils.escapeExpression(piece);
        }
    });
    return result;
};

exports.highlight_with_escaping_and_regex = function (regex, item) {
    var pieces = item.split(regex);
    var result = "";
    $.each(pieces, function (idx, piece) {
        if (piece.match(regex)) {
            result += "<strong>" + Handlebars.Utils.escapeExpression(piece) + "</strong>";
        } else {
            result += Handlebars.Utils.escapeExpression(piece);
        }
    });
    return result;
};

exports.highlight_query_in_phrase = function (query, phrase) {
    var i;
    query = query.toLowerCase();
    query = query.replace(/[\-\[\]{}()*+?.,\\\^$|#\s]/g, '\\$&');
    var regex = new RegExp('(^' + query + ')', 'ig');

    var result = "";
    var parts = phrase.split(' ');
    for (i = 0; i < parts.length; i++) {
        if (i > 0) result += " ";
        result += exports.highlight_with_escaping_and_regex(regex, parts[i]);
    }
    return result;
};

exports.private_message_typeahead_list = [];
exports.private_message_mapped = {};

exports.render_person = function (person) {
    return person.full_name + " <" + person.email + ">";
};

function add_to_known_recipients(recipient_data, count_towards_autocomplete_preference) {
    var name_string = exports.render_person(recipient_data);
    if (exports.private_message_mapped[name_string] === undefined) {
        exports.private_message_mapped[name_string] = recipient_data;
        exports.private_message_mapped[name_string].count = 0;
        exports.private_message_typeahead_list.push(name_string);
    }
    if (count_towards_autocomplete_preference) {
        exports.private_message_mapped[name_string].count += 1;
    }
}

exports.known_to_typeahead = function (recipient_data) {
    return exports.private_message_mapped[exports.render_person(recipient_data)] !== undefined;
};

exports.update_all_recipients = function (recipients) {
    $.each(recipients, function (idx, recipient_data) {
        add_to_known_recipients(recipient_data, false);
    });
};

exports.update_your_recipients = function (recipients) {
    $.each(recipients, function (idx, recipient_data) {
        if (recipient_data.email !== page_params.email) {
            add_to_known_recipients(recipient_data, true);
        }
    });
};

exports.remove_recipient = function (recipients) {
    $.each(recipients, function (idx, recipient_data) {
        var name_string = exports.render_person(recipient_data);
        delete exports.private_message_mapped[name_string];
        var arr = exports.private_message_typeahead_list;
        arr.splice(arr.indexOf(name_string), 1);
    });
};

function prefix_sort(query, objs, get_item) {
    // Based on Bootstrap typeahead's default sorter, but taking into
    // account case sensitivity on "begins with"
    var beginswithCaseSensitive = [];
    var beginswithCaseInsensitive = [];
    var noMatch = [];

    var obj = objs.shift();
    while (obj) {
        var item = get_item(obj);
        if (item.indexOf(query) === 0)
            beginswithCaseSensitive.push(obj);
        else if (item.toLowerCase().indexOf(query.toLowerCase()) === 0)
            beginswithCaseInsensitive.push(obj);
        else
            noMatch.push(obj);
        obj = objs.shift();
    }
    return { matches: beginswithCaseSensitive.concat(beginswithCaseInsensitive),
             rest:    noMatch };

}

exports.sorter = function (query, objs, get_item) {
   var results = prefix_sort(query, objs, get_item);
   return results.matches.concat(results.rest);
};

exports.compare_by_pms = function (user_a, user_b) {
    if (user_a.pm_recipient_count > user_b.pm_recipient_count) {
        return -1;
    } else if (user_a.pm_recipient_count < user_b.pm_recipient_count) {
        return 1;
    }

    // We use alpha sort as a tiebreaker, which might be helpful for
    // new users.
    if (user_a.full_name < user_b.full_name)
        return -1;
    else if (user_a === user_b)
        return 0;
    else
        return 1;
};

exports.sort_by_pms = function (objs) {
    objs.sort(exports.compare_by_pms);
    return objs;
};

function identity(item) {
    return item;
}

exports.sort_subjects = function (items) {
    return exports.sorter(this.query, items, identity);
};

exports.sort_recipients = function (matches, query) {
    var name_results =  prefix_sort(query, matches, function (x) { return x.full_name; });
    var email_results = prefix_sort(query, name_results.rest, function (x) { return x.email; });
    var matches_sorted_by_pms = exports.sort_by_pms(name_results.matches.concat(email_results.matches));
    var rest_sorted_by_pms = exports.sort_by_pms(email_results.rest);
    return matches_sorted_by_pms.concat(rest_sorted_by_pms);
};

exports.sort_emojis = function (matches, query) {
    //TODO: sort by category in v2
    var results = prefix_sort(query, matches, function (x) { return x.emoji_name; });
    return results.matches.concat(results.rest);
};

exports.sort_textbox_typeahead = function (matches) {
    // input may be free text ending in @ for autocomplete
    var query = composebox_typeahead.split_at_cursor(this.query)[0];
    var parts;

    if (query.lastIndexOf(":") > query.lastIndexOf("@")) {
        parts = query.split(':');
        query = parts[parts.length - 1];
        return exports.sort_emojis(matches, query);
    }

    if (query.indexOf('@') > -1) {
        parts = query.split('@');
        query = parts[parts.length - 1];
    }
    return exports.sort_recipients(matches, query);
};

exports.sort_recipientbox_typeahead = function (matches) {
    // input_text may be one or more pm recipients
    var cleaned = composebox_typeahead.get_cleaned_pm_recipients(this.query);
    var query = cleaned[cleaned.length - 1];
    return exports.sort_recipients(matches, query);};

return exports;

}());
