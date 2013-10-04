$(function() {

$.extend({winmgr: {
	baseParent: $('body'), // Where to stick newly created dialogs
	basePrefix: 'dialog-', // What prefix to use when creating anonymous dialogs
	baseOptions: { // Pass these options to jQuery-UI when creating the dialog
	},

	recover: true, // Re-open windows on page refresh

	dialogs: {}, // Storage for open dialogs

	init: function(options) {
		$.extend($.winmgr, options);
		if ($.winmgr.recover)
			$.winmgr.recoverState();
	},


	/**
	* Create a new dialog window
	*/
	spawn: function(options) {
		var settings = $.extend({}, {
			height: 200,
			width: 400,
			modal: false,
			resizeable: true,
			title: 'Information',
			'location': {left: 0, top: 0, width: 0, height: 0}, // {left: 0, top: 0, width: 0, height: 0}
			url: null,
			data: {}
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
				position: settings.location ? [settings.location.left, settings.location.top] : {my: 'center center', at: 'center center', of: $.winmgr.baseParent},
				close: function(e, ui) {
					delete $.winmgr.dialogs[settings.id];
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
			}));

		if (settings.content)
			settings.element.html(settings.content);

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

	refresh: function(id) {
		var win = $.winmgr.dialogs[id];
		if (!win)
			return;

		win.element.html(
			'<div class="pull-center"><i class="icon-spinner icon-spin icon-4x"></i></div>' +
			'<div class="pull-center pad-top muted">Loading country information...</div>'
		);

		$.ajax({
			url: win.url,
			data: win.data,
			cache: false,
			dataType: 'html',
			success: function(html) {
				win.element.html(html);
			},
			error: function(jq, errText) {
				win.element.html('<div class="alert alert-block alert-error">' + errText + '</div>');
			},
		});
	},

	saveState: function() {
		if (!$.winmgr.recover)
			return;

		var store = {};
		for (var d in $.winmgr.dialogs) {
			store[d] = $.extend({}, $.winmgr.dialogs[d]);
			delete store[d].element;
		}
		console.log('Save', store);

		localStorage.setItem('winmgr', JSON.stringify(store));
	},

	recoverState: function() {
		var lsState = localStorage.getItem('winmgr');
		if (lsState) {
			$.winmgr.dialogs = JSON.parse(lsState);
			for (var d in $.winmgr.dialogs) {
				console.log('Recover', $.winmgr.dialogs[d]);
				console.log('DIM', $.winmgr.dialogs[d].location);
				$.winmgr.spawn($.winmgr.dialogs[d]);
			}
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
