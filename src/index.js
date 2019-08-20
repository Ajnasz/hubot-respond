// Description:
//   The bot will respond to configured strings with configured answers
//
// Author:
//   Lajos Koszti <koszti.lajos@ustream.tv>
//
// Configuration:
//   None
//
// Dependencies:
//   None
//
// Commands:
//   hubot respond to {a text} with {value} - Creates a respond to respond_to and responds with value
//   hubot here respond to {a text} with {value} - Creates a respond to respond_to and responds with value but only in the current room
//   hubot delete respond to {a text} - Deletes respond respond_to
//   hubot from here delete respond to {a text} - Deletes respond respond_to
//   hubot list responds - Lists all responds


module.exports = function (robot) {
	'use strict';

	const Respond = {
		addRoom(room) {
			const rooms = new Set(this.rooms);
			rooms.add(room);

			this.rooms = Array.from(rooms);
		},

		removeRoom(room) {
			const rooms = new Set(this.rooms);
			rooms.delete(room);

			this.rooms = Array.from(rooms);
		},

		toObject() {
			return {
				rooms: this.rooms || [],
				value: this.value,
			};
		},
	};

	const brain = (function () {
		if (!robot.brain.get('responds')) {
			robot.brain.set('responds', Object.create(null));
		}

		robot.brain.once('loaded', migrate);

		function getRespond(name) {
			const responds = robot.brain.get('responds');
			const oldRespond = responds[name];
			const respond = Object.create(Respond);
			Object.assign(respond, oldRespond);

			return respond;
		}

		return {
			get (name) {
				return getRespond(name);
			},

			set (name, value, room = null) {
				const responds = robot.brain.get('responds') || Object.create(null);
				const newValue = Object.create(Respond);

				Object.assign(newValue, { value });

				if (room) {
					newValue.addRoom(room);
				}

				responds[name] = newValue.toObject();
				robot.brain.set('responds', responds);
			},

			unset (name) {
				let responds = robot.brain.get('responds');
				delete responds[name];
				robot.brain.set('responds', responds);
			},

			getAll () {
				let responds = robot.brain.get('responds');
				if (responds === null) {
					return [];
				}

				return Object.keys(responds).map((name) => [name, responds[name].value]);
			},

			getRespondRooms (name) {
				const respond = robot.brain.get('responds')[name];

				if (respond) {
					return respond.rooms;
				}

				return null;
			},

			unsetRespondRoom (name, room) {
				const responds = robot.brain.get('responds');
				const respond = getRespond(name);

				respond.removeRoom(room);
				if (respond.rooms.length) {
					responds[name] = respond.toObject();
				} else {
					delete responds[name];
				}

				robot.brain.set('responds', responds);
			},
		};
	}());

	const respondHandled = Symbol('respond handled');

	const INTERPOLATION_REGEXP = /(\{[a-zA-Z0-9]+\})/g;

	function formatMessage(str, args) {
		return str.replace(INTERPOLATION_REGEXP, function (i) {
			const key = i.slice(1, -1);
			if (key in args) {
				return args[key];
			}

			return i;
		}).replace('\\n', '\n');
	}

	function setMessageHandled (res) {
		Object.defineProperty(res.message, respondHandled, {
			enumerable: false,
			writable: false,
			configurable: false,
			value: true
		});
	}

	function isMessageAllowedInRoom(brain, room, key) {
		const respond = brain.get(key);
		return !respond || respond.rooms.length === 0 || respond.rooms.includes(room);
	}

	// ^|\\s|[,.\'"<>{}\\[\\]] and $|\\s|[,.\'"<>{}\\[\\]] is dumb word boundary for unicode chars
	function createRespondRegexp(respond) {
		return new RegExp(`(?:\\b|^|\\s|[-,.'"<>{}\\[\\]])(${respond})(?:\\b|\\s|$|[-,.'"<>{}\\[\\]])`, 'i');

	}

	function normalizeTrigger(trigger) {
		return trigger.trim().toLowerCase();
	}

	function migrate () {
		const migrations = [
			function () {
				if (robot.brain.data.responds) {
					let responds = robot.brain.data.responds;
					delete robot.brain.data.responds;
					robot.brain.set('responds', responds || Object.create(null));
				}
			},

			function () {
				if (robot.brain.get('responds')) {
					let responds = robot.brain.get('responds') || Object.create(null);

					delete robot.brain.data.responds;

					robot.brain.set('responds', Object.keys(responds).reduce((out, key) => {
						const value = responds[key];

						if (typeof value !== 'object') {
							out[key] = { value, rooms: [] };
						}

						return out;
					}, Object.create(null)));
				}
			},
		];

		let lastMigratedIndex = robot.brain.get('responds_migrations') || 0;

		robot.logger.debug('last migrations', lastMigratedIndex);

		migrations.slice(lastMigratedIndex).forEach((item, index) => {
			item();
			robot.brain.set('responds_migrations', lastMigratedIndex + index + 1);
			robot.logger.debug('call migration script', lastMigratedIndex + index + 1);
		});

		robot.logger.debug('last migrated', robot.brain.get('responds_migrations'));
	}

	robot.respond(/from\s+here\s+delete\s+respond\s+to\s+(.+)/, (res) => {
		setMessageHandled(res);
		const key = normalizeTrigger(res.match[1]);

		brain.unsetRespondRoom(key, res.message.room);
		res.reply(`respond to ${key} deleted from room ${res.message.room}`);
	});

	robot.respond(/delete\s+respond\s+to\s+(.+)/, (res) => {
		setMessageHandled(res);
		const key = normalizeTrigger(res.match[1]);

		if (brain.get(key)) {
			brain.unset(key);

			res.reply(`respond to ${key} deleted`);
			return;
		}

		res.reply('respond not found');
	});

	robot.respond(/list\s+responds/, (res) => {
		let responds = brain.getAll();

		if (!responds.length) {
			return res.reply('No respond has been set yet.');
		}

		res.reply(responds.map((respond) => `respond to ${respond[0]} with ${respond[1]}`).join('\n'));
	});

	robot.respond(/(here\s+)?respond\s+to\s+(.+?)\s+with\s+(.+)/i, (res) => {
		setMessageHandled(res);

		const key = normalizeTrigger(res.match[2]);
		const value = res.match[3].trim();
		const here = !!res.match[1];

		let updated = false;

		// delete previous respond
		if (brain.get(key)) {
			brain.unset(key);
			updated = true;
		}

		// by postponing add, the robot listen will not respond to the query.
		brain.set(key, value, here && res.message.room);

		res.reply(updated ? 'Respond updated' : 'Respond added');
		robot.logger.debug(`new respond added ${key}=${value}`);
	});

	robot.listen((res) => {
		if (!res.text || res[respondHandled]) {
			return null;
		}

		const responds = Array.from(new Set(brain.getAll().map(a => a[0])));

		if (responds.length < 1) {
			return null;
		}

		const match = Array.from(responds).find((matcher) => {
			const re = createRespondRegexp(matcher);
			return re.test(res.text);
		});

		return match && match.toLowerCase();
	}, (res) => {
		const match = res.match;
		const text = brain.get(res.match).value;

		const allowedInRoom = isMessageAllowedInRoom(brain, res.message.room, match);

		if (allowedInRoom) {
			res.send(formatMessage(text, { sender: res.message.user.name, room: res.message.room }));

			robot.logger.debug(`respond matched: ${match}`);
		}
	});
};
