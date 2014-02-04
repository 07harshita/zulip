var hashchange = (function () {

var exports = {};

var expected_hash;
var changing_hash = false;

// Some browsers zealously URI-decode the contents of
// window.location.hash.  So we hide our URI-encoding
// by replacing % with . (like MediaWiki).

exports.encodeHashComponent = function (str) {
    return encodeURIComponent(str)
        .replace(/\./g, '%2E')
        .replace(/%/g,  '.');
};

function decodeHashComponent(str) {
    return decodeURIComponent(str.replace(/\./g, '%'));
}

exports.changehash = function (newhash) {
    if (changing_hash) {
        return;
    }
    $(document).trigger($.Event('hashchange.zulip'));
    expected_hash = newhash;
    window.location.hash = newhash;
    util.reset_favicon();
};

// Encodes an operator list into the
// corresponding hash: the # component
// of the narrow URL
exports.operators_to_hash = function (operators) {
    var hash = '#';

    if (operators !== undefined) {
        hash = '#narrow';
        _.each(operators, function (elem) {
            // Support legacy tuples.
            var operator = elem.operator || elem[0];
            var operand = elem.operand || elem[1];

            hash += '/' + hashchange.encodeHashComponent(operator)
                  + '/' + hashchange.encodeHashComponent(operand);
        });
    }

    return hash;
};

exports.save_narrow = function (operators) {
    if (changing_hash) {
        return;
    }
    var new_hash = exports.operators_to_hash(operators);
    exports.changehash(new_hash);
};

function parse_narrow(hash) {
    var i, operators = [];
    for (i=1; i<hash.length; i+=2) {
        // We don't construct URLs with an odd number of components,
        // but the user might write one.
        try {
            var operator = decodeHashComponent(hash[i]);
            var operand  = decodeHashComponent(hash[i+1] || '');
            operators.push([operator, operand]);
        } catch (err) {
            return undefined;
        }
    }
    return operators;
}

function activate_home_tab() {
    ui.change_tab_to("#home");
    narrow.deactivate();
    ui.update_floating_recipient_bar();
}

// Returns true if this function performed a narrow
function do_hashchange() {
    // If window.location.hash changed because our app explicitly
    // changed it, then we don't need to do anything.
    // (This function only neds to jump into action if it changed
    // because e.g. the back button was pressed by the user)
    //
    // The second case is for handling the fact that some browsers
    // automatically convert '#' to '' when you change the hash to '#'.
    if (window.location.hash === expected_hash ||
        (expected_hash !== undefined &&
         window.location.hash.replace(/^#/, '') === '' &&
         expected_hash.replace(/^#/, '') === '')) {
        return false;
    }

    $(document).trigger($.Event('hashchange.zulip'));

    // NB: In Firefox, window.location.hash is URI-decoded.
    // Even if the URL bar says #%41%42%43%44, the value here will
    // be #ABCD.
    var hash = window.location.hash.split("/");
    switch (hash[0]) {
        case "#narrow":
            ui.change_tab_to("#home");
            var operators = parse_narrow(hash);
            if (operators === undefined) {
                // If the narrow URL didn't parse, clear
                // window.location.hash and send them to the home tab
                window.location.hash = '';
                activate_home_tab();
                return false;
            }
            narrow.activate(operators, {
                first_unread_from_server: true,
                select_first_unread: true,
                change_hash:    false,  // already set
                trigger: 'hash change'
            });
            ui.update_floating_recipient_bar();
            return true;
        case "":
        case "#":
            activate_home_tab();
            break;
        case "#subscriptions":
            ui.change_tab_to("#subscriptions");
            break;
        case "#administration":
            ui.change_tab_to("#administration");
            break;
        case "#settings":
            ui.change_tab_to("#settings");
            break;
    }
    return false;
}

function hashchanged() {
    changing_hash = true;
    var ret = do_hashchange();
    changing_hash = false;
    return ret;
}

exports.initialize = function () {
    // jQuery doesn't have a hashchange event, so we manually wrap
    // our event handler
    window.onhashchange = blueslip.wrap_function(hashchanged);
    hashchanged();
};

return exports;

}());
if (typeof module !== 'undefined') {
    module.exports = hashchange;
}
