$(function() {

$.extend({winmgr: {
	baseParent: $('body'), // Where to stick newly created dialogs
	basePrefix: 'dialog-', // What prefix to use when creating anonymous dialogs
	baseOptions: { // Pass these options to jQuery-UI when creating the dialog
	},

	recover: true, // Re-open windows on page refresh

	dialogs: {}, // Storage for open dialogs

	autoRefresh: 10000, // How often an auto-refresh action should take place in milliseconds (set to null to disable)

	fragmentRedirect: ['#redirect'], // Use this as a redirection if present
	fragmentContent: ['#content', 'body'], // The content container on all AJAX calls (i.e. strip out everything except this when displaying) - the first found element will be used if this is an array
	fragmentTitle: ['#title', 'title'], // Allow the window title to use this element contents on AJAX load (null to disable) - the first found element will be used if this is an array

	init: function(options) {
		$.extend($.winmgr, options);
		if ($.winmgr.recover)
			$.winmgr.recoverState();
		if ($.winmgr.autoRefresh)
			setTimeout($.winmgr.autoRefreshPoll, $.winmgr.autoRefresh);
	},

	/**
	* Run a series of jQuery selectors returning the first matching item
	* @param array|string selectors An array of selectors to try or a simple string (in which case DOM.find() is run normally)
	* @param object DOM jQuery object representing the DOM to scan
	* @return array The first matching item
	*/
	_findFirst: function(selectors, DOM) {
		if (typeof selectors == 'string') // Just run normally if its a string
			return DOM.find(selectors);

		for (var i in selectors) {
			var res = DOM.find(selectors[i]);
			if (res.length)
				return res.first();
		}
		return [];
	},

	/**
	* The actual worker for the autoRefresh operation
	*/
	autoRefreshPoll: function() {
		var now = (new Date).getTime();
		for (var d in $.winmgr.dialogs) {
			if (
				$.winmgr.dialogs[d].status != 'loading' // Its not already loading AND
				&& $.winmgr.dialogs[d].autoRefresh // AutoRefresh is enabled AND
				&& $.winmgr.dialogs[d].lastRefresh + $.winmgr.dialogs[d].autoRefresh <= now // Its due to be updated
			) {
				$.winmgr.refresh(d);
			}
		}
		if ($.winmgr.autoRefresh)
			setTimeout($.winmgr.autoRefreshPoll, $.winmgr.autoRefresh);
	},

	/**
	* Create a new dialog window
	*/
	spawn: function(options) {
		var settings = $.extend({}, {
			// WARNING: If any new options are added remember to update the list in $.winmgr.saveState so that it gets saved
			height: 200,
			width: 400,
			modal: false,
			resizeable: true,
			title: 'Information',
			'location': {left: 0, top: 0, width: 0, height: 0}, // {left: 0, top: 0, width: 0, height: 0}
			url: null,
			data: {},
			status: 'idle', // ENUM: ('idle', 'loading', 'error')
			autoRefresh: $.winmgr.autoRefresh, // Auto refresh this dialog this number of milliseconds (poll occurs based on $.winmgr.autoRefresh though so it might not be accurate)
			lastRefresh: 0,
			scroll: {top: 0, left: 0} // Default scroll offsets (mainly used to restore scrolling to windows after refresh / restores)
		}, options);
		if (!settings.id)
			settings.id = $.winmgr.getUniqueId($.winmgr.basePrefix);
		if (!settings.element)
			settings.element = $('<div></div>')
				.attr('id', settings.id)
				.appendTo($.winmgr.baseParent);

		settings.element
			.dialog($.extend({}, $.winmgr.baseOptions, {
				width: settings.location && settings.location.width ? settings.location.width : settings.width,
				height: settings.location && settings.location.height ? settings.location.height : settings.height,
				modal: settings.modal,
				resizeable: settings.resizable,
				title: settings.title,
				position: settings.location.left || settings.location.top ? [settings.location.left, settings.location.top] : {my: 'center center', at: 'center center', of: $.winmgr.baseParent},
				close: function(e, ui) {
					delete($.winmgr.dialogs[settings.id]);
					$.winmgr.saveState();
				},
				dragStop: function(e, ui) {
					$.winmgr.dialogs[settings.id].location.left = ui.position.left;
					$.winmgr.dialogs[settings.id].location.top = ui.position.top;
					$.winmgr.saveState();
				},
				resizeStop: function(e, ui) {
					$.winmgr.dialogs[settings.id].location.left = ui.position.left;
					$.winmgr.dialogs[settings.id].location.top = ui.position.top;
					$.winmgr.dialogs[settings.id].location.width = ui.size.width;
					$.winmgr.dialogs[settings.id].location.height = ui.size.height;
					$.winmgr.saveState();
				}
			}))
			.on('scroll', function(e) {
				var me = $(this);
				var win = $.winmgr.dialogs[settings.id];
				if (win.status == 'idle') {
					win.scroll.top = me.scrollTop();
					win.scroll.left = me.scrollLeft();
					$.winmgr.saveState();
				}
			});

		if (settings.content) { // Load static content
			settings.element.html(settings.content);
			if (settings.scroll.top)
				$.winmgr.dialogs[settings.id].element.scrollTop(settings.scroll.top);
			if (settings.scroll.left)
				$.winmgr.dialogs[settings.id].element.scrollLeft(settings.scroll.left);
		}

		if (!settings.location.left && !settings.location.top) {
			var pos = settings.element.position;
			settings.location.left = pos.left;
			settings.location.left = pos.top;
		}

		settings.location = {left: settings.location.left || settings.left, top: settings.location.top || settings.top, width: settings.location.width || settings.width, height: settings.location.height || settings.height};
		delete(settings.left);
		delete(settings.top);
		delete(settings.width);
		delete(settings.height);

		$.winmgr.dialogs[settings.id] = settings;

		if (settings.url) // Trigger data refresh if there is something to load
			$.winmgr.refresh(settings.id);
		$.winmgr.saveState();
	},

	/**
	/* Navigate an existing dialog to a new URL
	* @param string id The id of the dialog
	* @param string url The new URL to navigate to
	* @param object data Optional data hash to also pass
	*/
	go: function(id, url, data) {
		var win = $.winmgr.dialogs[id];
		win.url = url;
		win.data = data;
		$.winmgr.saveState();
		$.winmgr.refresh(id);
	},

	refresh: function(id) {
		var win = $.winmgr.dialogs[id];
		if (!win)
			return;

		win.element
			// .trigger('scroll') // Trigger scroll event to save scroll position before we override
			.html(
				'<div class="pull-center"><i class="icon-spinner icon-spin icon-4x"></i></div>' +
				'<div class="pull-center pad-top muted">Loading country information...</div>'
			);
		win.status = 'loading';

		$.ajax({
			url: win.url,
			data: win.data,
			cache: false,
			dataType: 'html',
			success: function(html) {
				var body = $('<div></div>')
					.append(html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')); // Strip scripts from incomming to avoid permission denied errors in IE
				// Process redirection {{{
				if ($.winmgr.fragmentRedirect) {
					var redirectDOM = $.winmgr._findFirst($.winmgr.fragmentRedirect, body);
					if (redirectDOM.length) {
						setTimeout(function() { // Set redirect on next free moment the browser has to go to new URL
							$.winmgr.go(id, redirectDOM.text());
						}, 0);
					}
				}
				// }}}
				// Process window title {{{
				if ($.winmgr.fragmentTitle) {
					var titleDOM = $.winmgr._findFirst($.winmgr.fragmentTitle, body);
					if (titleDOM.length)
						$.winmgr.setTitle(id, titleDOM.html());
				}
				// }}}
				// Process content {{{
				var content = $.winmgr._findFirst($.winmgr.fragmentContent, body);
				if (content.length) {
					win.element.html(content.html());
					if (win.scroll.top)
						win.element.scrollTop(win.scroll.top);
					if (win.scroll.left)
						win.element.scrollLeft(win.scroll.left);
					win.status = 'idle';
				} else {
					win.element.html('<div class="alert alert-block alert-error">No content found matching ' + $.winmgr.fragmentContent + '</div>');
					win.status = 'error';
				}
				// }}}
				win.lastRefresh = (new Date).getTime();
			},
			error: function(jq, errText) {
				win.element.html('<div class="alert alert-block alert-error">' + errText + '</div>');
				win.status = 'error';
			},
		});
	},

	/**
	* Set the title of a given dialog
	* This function only really exists so it can be subclassed/overridden if you need your own fancy title bar
	* @param string id The ID of the dialog to set the title of
	* @param string title The new title of the window
	* @param bool save Whether to trigger $.winmgr.saveState() after the call (defaults to true)
	*/
	setTitle: function(id, title, save) {
		$.winmgr.dialogs[id].element.siblings('.ui-dialog-titlebar').html(title);
		$.winmgr.dialogs[id].title = title;
		if (save || save === undefined)
			$.winmgr.saveState();
	},

	/**
	* Close and release the given dialog
	* @param string id The ID of the dialog to close
	*/
	close: function(id) {
		$.winmgr.dialogs[id].element.dialog('close');
	},

	saveState: function() {
		if (!$.winmgr.recover)
			return;

		var store = {};
		for (var d in $.winmgr.dialogs) {
			store[d] = { // Only import the following
				location: $.winmgr.dialogs[d].location,
				modal: $.winmgr.dialogs[d].modal,
				resizeable: $.winmgr.dialogs[d].resizeable,
				title: $.winmgr.dialogs[d].title,
				url: $.winmgr.dialogs[d].url,
				data: $.winmgr.dialogs[d].data,
				scroll: $.winmgr.dialogs[d].scroll
			};
		}
		localStorage.setItem('winmgr', JSON.stringify(store));
	},

	recoverState: function() {
		var lsState = localStorage.getItem('winmgr');
		if (lsState) {
			var newStates = JSON.parse(lsState);
			for (var d in newStates)
				$.winmgr.spawn(newStates[d]);
		}
	},

	// Utility functions {{{
	getUniqueId: function(prefix) {
		if (!prefix)
			prefix = 'batt-';
		while (1) {
			var id = prefix + Math.floor(Math.random()*99999);
			if ($('#' + id).length == 0)
				return id;
		}
	}
	// }}}
}});

});
