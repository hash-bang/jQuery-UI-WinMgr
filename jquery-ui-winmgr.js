$(function() { 

$.extend({winmgr: {
	baseParent: $('body'), // Where to stick newly created dialogs
	basePrefix: 'dialog-', // What prefix to use when creating anonymous dialogs
	baseOptions: { // Pass these options to jQuery-UI when creating the dialog
	},
	baseData: { // Merge all outgoing AJAX requests with the following POST data
		'jquery-winmgr': '1'
	},

	recover: true, // Re-open windows on page refresh

	dialogs: {}, // Storage for open dialogs

	autoRefresh: 10000, // How often an auto-refresh action should take place in milliseconds (set to null to disable)
	autoRefreshSubmit: false, // Refresh by submitting the inner form of the dialog (works best on edit frames). If no form is present the dialog is refreshed in the usual way

	fragmentRedirect: ['#redirect'], // Use this as a redirection if present
	fragmentContent: ['#content', 'body'], // The content container on all AJAX calls (i.e. strip out everything except this when displaying) - the first found element will be used if this is an array
	fragmentTitle: ['#title', 'title'], // Allow the window title to use this element contents on AJAX load (null to disable) - the first found element will be used if this is an array
	fragmentFooter: ['#footer'], // Allow the window footer to use this element contents on AJAX load (null to disable) - the first found element will be used if this is an array
	fragmentOptions: ['#winmgr'], // Allow the window options array to import this JSON on AJAX load (null to disable) - the first found element will be used if this is an array

	linkOptionsAttr: 'winmgr', // When clicking a link import options (via setOptions()) from this data attribute e.g. <a href="somewhere" data-winmgr='{"title": "Hello World"}'>Link</a> - null to disable
	globalHandler: true, // Register a global click handler for anything with the data attribute specified in $.winmgr.linkOptionsAttr. This makes WinMgr handle links outside normal dialogs if they have [data-winmgr] (the default) setup

	// Event Hooks {{{
	// All the below are the default handlers for various events.
	// You can override any of these during the init() operation e.g. $.winmgr.init({onPreLoad: function() { // Do something else})
	onPreLoad: function(id) { return; }, // Binder to execute other actions before AJAX load gets called with the id of the dialog thats loaded
	onPostLoad: function(id) { return; }, // Binder to execute other actions after AJAX load gets called with the id of the dialog thats loaded
	onSetStatus: function(id, status) { // Binder to handle status changes. Its default actions are to defer to onSetStatus<Status> (e.g. onSetStatusLoading)
		if (status == 'idle') {
			$.winmgr.onSetStatusIdle(id);
		} else if (status == 'loading') {
			$.winmgr.onSetStatusLoading(id);
		} else if (status == 'error') {
			$.winmgr.onSetStatusError(id);
		}
	},
	onSetStatusIdle: function(id) { return; }, // Binder to handle 'idle' status
	onSetStatusError: function(id) { // Binder to handle 'error' status - Default action is to display the .error property in a nice alert box
		var win = $.winmgr.dialogs[id];
		win.element.html('<div class="alert alert-block alert-error">' + win.error + '</div>');
	},
	onSetStatusLoading: function(id) { // Binder to handle 'loading' status - Default action is to display a holding message
		var win = $.winmgr.dialogs[id];
		win.element.html(
			'<div class="pull-center pad-top"><i class="icon-spinner icon-spin icon-4x"></i></div>' +
			'<div class="pull-center pad-top muted">Loading...</div>'
		);
	},
	// }}}

	init: function(options) {
		$.extend($.winmgr, options);
		if ($.winmgr.recover)
			$.winmgr.recoverState();
		if ($.winmgr.autoRefresh)
			setTimeout($.winmgr.autoRefreshPoll, $.winmgr.autoRefresh);
		if ($.winmgr.globalHandler)
			$(document).on('click', 'a[data-' + $.winmgr.linkOptionsAttr + ']', function(e) {
				e.preventDefault();
				$.winmgr.clickLink(null, $(this));
			});
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
				var refreshed = 0;
				// Refresh via form submit {{{
				if ($.winmgr.autoRefreshSubmit) { // Try to find a form to submit
					var form = $.winmgr.dialogs[d].element.find('form').first();
					if (form.length) {
						refreshed = 1;
						setTimeout(function() { // When the browser next has a free moment
							$.winmgr.submitForm(d, form);
						}, 0);
					}
				}
				// }}}
				// Submit in the normal way {{{
				if (!refreshed)
					$.winmgr.refresh(d);
				// }}}
			}
		}
		if ($.winmgr.autoRefresh)
			setTimeout($.winmgr.autoRefreshPoll, $.winmgr.autoRefresh);
	},

	/**
	* Create a new dialog window
	* @param object Object properties to create the the window with
	* @return string The ID of the newly created dialog
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
			error: null, // The last error (string) to occur - used by onSetStatus(id, 'error') to display something helpful
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
				position: $.winmgr._getPosition(settings.location),
				close: function(e, ui) {
					delete($.winmgr.dialogs[settings.id]);
					$.winmgr.saveState();
					if ($.winmgr.baseOptions.close)
						$.winmgr.baseOptions.close.call(this, e, ui);
				},
				dragStop: function(e, ui) {
					$.winmgr.dialogs[settings.id].location.left = ui.position.left;
					$.winmgr.dialogs[settings.id].location.top = ui.position.top;
					$.winmgr.saveState();
					if ($.winmgr.baseOptions.dragStop)
						$.winmgr.baseOptions.dragStop.call(this, e, ui);
				},
				resizeStop: function(e, ui) {
					$.winmgr.dialogs[settings.id].location.left = ui.position.left;
					$.winmgr.dialogs[settings.id].location.top = ui.position.top;
					$.winmgr.dialogs[settings.id].location.width = ui.size.width;
					$.winmgr.dialogs[settings.id].location.height = ui.size.height;
					$.winmgr.saveState();
					if ($.winmgr.baseOptions.resizeStop)
						$.winmgr.baseOptions.resizeStop.call(this, e, ui);
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
			})
			.on('submit', 'form', function(e) {
				e.preventDefault();
				$.winmgr.submitForm(settings.id, $(this));
			})
			.on('click', 'a[href]', function(e) {
				if ($.winmgr.clickLink(settings.id, $(this)))
					e.preventDefault();
			});

		// Fix: Catch all clicks for anything with type=submit and turn it into a form submission {{{
		settings.element.closest('.ui-dialog')
			.on('click', '[type=submit]', function() {
				var form = $(this).closest('.ui-dialog').find('form');
				if (form.length) {
					if ($(this).attr('name')) { // Include my submission value in the stream
						var myValue = form.find('input[name="' + $(this).attr('name') + '"]');
						if (!myValue.length) { // Doesn't already exist - append it
							$('<input/>')
								.attr('name', $(this).attr('name'))
								.attr('type', 'hidden')
								.val($(this).val() || $(this).attr('value'))
								.appendTo(form);
						}
					}
					form.submit();
				}
			});
		// }}}

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

		if (settings.title)
			$.winmgr.setTitle(settings.id, settings.title, false);

		if (settings.url) // Trigger data refresh if there is something to load
			$.winmgr.refresh(settings.id);
		$.winmgr.saveState();

		return settings.id;
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

	/**
	* Convenience function to submit a form within a dialog
	* @param string id The id of the dialog the form belongs to
	* @param object form The jQuery object of the form being submitted. If omitted the first form found within the dialog is used
	* @param bool incFooter Include any elements found in the footer in the post (defaults to true)
	*/
	submitForm: function(id, form, incFooter) {
		if (!form)
			form = $.winmgr.dialogs[id].element.find('form').first();

		var data = {};

		form.find('input[name], select[name], textarea[name]').each(function() {
			data[$(this).attr('name')] = $(this).val();
		});

		if (incFooter || incFooter === undefined)
			$.winmgr.dialogs[id].element.closest('.ui-dialog').find('.ui-dialog-buttonpane').find('input[name], select[name], textarea[name]').each(function() {
				data[$(this).attr('name')] = $(this).val();
			});

		console.log('Submit', form.attr('action'), data);

		$.winmgr.go(id, form.attr('action'), data);
	},

	/**
	* Simulate clicking a link inside a dialog
	* @param string id Optional id of the dialog the link belongs to
	* @param object link The jQuery object of the link being clicked
	* @return bool Whether the link was dealt with by WinMgr or FALSE if the browser should handle it normally
	*/
	clickLink: function(id, link) {
		var href = link.attr('href');
		if (!href || href.substr(0, 1) == '#') // Inner page link - ignore
			return;
		if (link.data($.winmgr.linkOptionsAttr)) { // Open new window
			var winOptions = {
				title: id ? $.winmgr.dialogs[id].title : 'Loading...',
				url: href
			};
			var importOptions = link.data($.winmgr.linkOptionsAttr);
			if (importOptions)
				$.extend(winOptions, importOptions);
			
			$.winmgr.spawn(winOptions);
			return true;
		} else if (link.attr('target')) { // Has a target - let the browser deal with it
			return false;
		} else { // Replace this window
			if (id) {
				$.winmgr.go(id, href);
			} else { // No id, no options - just open a new window and hope for the best
				$.winmgr.spawn({
					url: href
				});
			}
			return true;
		}
	},

	refresh: function(id) {
		var win = $.winmgr.dialogs[id];
		if (!win)
			return;

		win.status = 'loading';
		$.winmgr.onSetStatus(id, win.status); // Kick off the status change

		$.winmgr.onPreLoad(id);
		$.ajax({
			url: win.url,
			data: $.extend({}, $.winmgr.baseData, win.data),
			cache: false,
			dataType: 'html',
			type: 'POST',
			success: function(html) {
				var body = $('<div></div>')
					.append(html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')); // Strip scripts from incomming to avoid permission denied errors in IE
				var saveState = 0;
				// Process options {{{
				if ($.winmgr.fragmentOptions) {
					var optionsDOM = $.winmgr._findFirst($.winmgr.fragmentOptions, body);
					if (optionsDOM.length) {
						var importJSON = JSON.parse(optionsDOM.html());
						if (!importJSON) {
							console.warn('Invalid JSON when trying to import WinMgr options:', optionsDOM.html());
						} else {
							$.winmgr.setOptions(id, importJSON, 0);
							saveState = 1;
						}
					}
				}
				// }}}
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
					if (titleDOM.length) {
						$.winmgr.setTitle(id, titleDOM.html(), 0);
						saveState = 1;
					}
				}
				// }}}
				// Process footer {{{
				var footer = $.winmgr._findFirst($.winmgr.fragmentFooter, body);
				if (footer.length) {
					var dialog = win.element.closest('.ui-dialog');
					var dialogFooter = dialog.find('.ui-dialog-buttonpane');
					if (!dialogFooter.length)
						dialogFooter = $('<div></div>')
							.addClass('ui-dialog-buttonpane ui-widget-content ui-helper-clearfix')
							.appendTo(dialog);

					dialogFooter.html(footer.html());
					footer.remove();
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
					$.winmgr.onSetStatus(id, win.status);
				} else {
					win.error = 'No content found matching ' + $.winmgr.fragmentContent;
					win.status = 'error';
					$.winmgr.onSetStatus(id, win.status);
				}
				// }}}
				win.lastRefresh = (new Date).getTime();
				$.winmgr.onPostLoad(id);
				if (saveState)
					$.winmgr.saveState();
			},
			error: function(jq, errText) {
				win.error = errText;
				win.status = 'error';
				$.winmgr.onSetStatus(id, win.status);
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
	* Elegantly change the options for a given dialog array
	* This triggers the various handlers for certain options such as setTitle if a .title change is detected
	* @param string id The ID of the dialog to change the options of
	* @param array options The options to import
	* @param bool save Whether to automatically trigger the saveState() call after importing (defaults to true)
	*/
	setOptions: function(id, options, save) {
		var oNew = $.extend({}, options);
		var oOld = $.winmgr.dialogs[id];
		var change = {};

		// .title {{{
		if (oNew.title && oOld.title != oNew.title)
			$.winmgr.setTitle(id, oNew.title, false);
		delete(oNew.title);
		// }}}
		// .modal {{{
		if (oNew.modal && oOld.modal != oNew.modal) {
			$.winmgr.dialogs[id].element.dialog('option', 'modal', oNew.modal);
			change.modal = oNew.modal
		}
		delete(oNew.modal);
		// }}}
		// .resizeable {{{
		if (oNew.resizeable && oOld.resizeable != oNew.resizeable) {
			$.winmgr.dialogs[id].element.dialog('option', 'resizeable', oNew.resizeable);
			change.resizeable = oNew.resizeable
		}
		delete(oNew.resizeable);
		// }}}
		// .autoRefresh {{{
		if (oNew.autoRefresh && oNew.autoRefesh != oOld.autoRefresh)
			change.autoRefresh = oNew.autoRefresh;
		delete(oNew.autoRefresh);
		// }}}
		// .location {{{
		if (oNew.location) {
			$.winmgr.move(id, oNew.location, 1, 0);
			delete(oNew.location);
		}
		// }}}

		if (Object.keys(change).length) // Anything left over?
			console.warn('Cannot import unknown options to WinMgr ID:', id, change);

		$.extend($.winmgr.dialogs[id], change);
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

	/**
	* Relocate a window based on its location properties (left,top,width,height)
	* @param string The ID of the dialog to move
	* @param object The location object to use when moving
	* @param bool animate Whether to animate the move operation
	* @param bool save Whether to trigger $.winmgr.saveState() after moving - defaults to true
	*/
	move: function(id, location, animate, save) {
		$.extend($.winmgr.dialogs[id].location, location);
		var el = $.winmgr.dialogs[id].element;
		el.dialog('option', 'position', $.winmgr._getPosition(location));
		if (location.width)
			el.dialog('option', 'width', location.width);
		if (location.height)
			el.dialog('option', 'height', location.height);
			
		if (save || save === undefined)
			$.winmgr.saveState();
	},

	/**
	* Helper to position windows
	* When given a location object ({left, top, width, height}) attempts to place the window
	* e.g.
	*	{left: center, top: center}
	*	{left: 10, top: 10}
	*	{left: -50, top: 10} // Position -50 of full parent width
	*
	* @param object A jQuery UI position object
	*/
	_getPosition: function(location) {
		var out = { of: $.winmgr.baseParent };
		var myX = 'left';
		var myY = 'top';
		var atX = 0;
		var atY = 0;
		if (location.left > 0) {
			atX = 'left+' + location.left;
		} else if (location.left < 0) {
			myX = 'right';
			atX = 'right-' + location.left;
		} else {
			myX = 'center';
			atX = 'center';
		}

		if (location.top > 0) {
			atY = 'top+' + location.top;
		} else if (location.top < 0) {
			myY = 'bottom';
			atY = 'bottom-' + location.top;
		} else {
			myY = 'center';
			atY = 'center';
		}

		return {my: myX + ' ' + myY, at: atX + ' ' + atY, of: $.winmgr.baseParent};
	},

	getByTitle: function(title) {
		for (var id in $.winmgr.dialogs) {
			if (
				typeof title == 'string' &&
				$.winmgr.dialogs[id].title == title
			) {
				return id;
			} else if (
				typeof title == 'object' && // Probably a RegExp
				title.exec($.winmgr.dialogs[id].title)
			) {
				return id;
			}
		}
		return null;
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
