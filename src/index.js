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
//   hubot list responds - Lists all responds


module.exports = function (robot) {
	'use strict';

	const respondHandled = Symbol('respond handled');

	const INTERPOLATION_REGEXP = /(\{[a-zA-Z0-9]+\})/g;

	function findIndex(array, cb, index = -1) {
		if (array.length === 0) {
			return -1;
		}

		if (cb(array[0])) {
			return index + 1;
		}

		return findIndex(array.slice(1), cb, index + 1);
	}

	const Respond = {
		setRoom(room) {
			this.room = room;
		},

		removeRoom(room) {
			const rooms = new Set(this.rooms);
			rooms.delete(room);

			this.rooms = Array.from(rooms);
		},

		toRegExp() {
			return createRespondRegexp(this.name);
		},

		isEligibleForRoom(room) {
			return this.room === room || !this.room;
		},

		toObject() {
			return {
				room: this.room || null,
				value: this.value,
				name: this.name,
			};
		},
	};

	const Responds = (function () {
		if (!robot.brain.get('responds')) {
			robot.brain.set('responds', []);
		}

		robot.brain.once('loaded', migrate);

		function areRespondsEqual(res1, res2) {
			return res1.name === res2.name && res1.room === res2.room;
		}

		function saveRespond(respond) {
			const responds = robot.brain.get('responds') || [];
			const index = findIndex(responds, res => areRespondsEqual(res, { name: respond.name, room: respond.room }));

			if (index > -1) {
				responds[index] = respond;
				robot.brain.set('responds', responds);
				return;
			}

			robot.brain.set('responds', responds.concat(respond));
		}

		function rawRespondToRespond(rawRespond) {
			const respond = Object.create(Respond);
			Object.assign(respond, rawRespond);
			return respond;
		}

		function findRespond(name, room = null, match = null) {
			const responds = Responds.getAll();

			const search = match ? (respond) => respond.toRegExp().test(match) : (respond) => respond.name === name;

			const respond = responds.find(respond => search(respond) && respond.isEligibleForRoom(room));

			return respond;
		}

		return {
			findOne({ name, room = null, match = null }) {
				return findRespond(name, room, match);
			},

			find({ name, room }) {
				const responds = Responds.getAll();

				return responds
					.filter(respond => respond.name === name && respond.isEligibleForRoom(respond, room));
			},

			upsert({ name, value, room = null }) {
				saveRespond({ name, value, room });
			},

			remove({ name, room = null }) {
				const responds = Responds.getAll();

				robot.brain.set('responds', responds.filter((respond) => {
					return !(respond.name === name && (!room || respond.room === room));
				}).map(r => r.toObject()));
			},

			getAll() {
				const responds = robot.brain.get('responds');
				if (responds === null) {
					return [];
				}

				return responds.map(rawRespondToRespond);
			},
		};
	}());

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

	// ^|\\s|[,.\'"<>{}\\[\\]] and $|\\s|[,.\'"<>{}\\[\\]] is dumb word boundary for unicode chars
	function createRespondRegexp(respond) {
		return new RegExp(`(?:\\b|^|\\s|[-,.'"<>{}\\[\\]])(${respond})(?:\\b|\\s|$|[-,.'"<>{}\\[\\]])`, 'i');

	}

	function normalizeTrigger(trigger) {
		return trigger.trim().toLowerCase();
	}

	function isMessageAllowedInRoom(room, name) {
		const respond = Responds.findOne({ name });
		return !respond || respond.room === null || respond.room === room;
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
					const responds = robot.brain.get('responds') || Object.create(null);

					robot.brain.set('responds', Object.keys(responds)
						.map((key) => ({
							name: key,
							room: null,
							value: responds[key],
						}), Object.create(null)));
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

	robot.respond(/delete\s+respond\s+to\s+(.+)/, (res) => {
		setMessageHandled(res);
		const key = normalizeTrigger(res.match[1]);

		if (Responds.findOne({ name: key })) {
			Responds.remove({ name: key });

			res.reply(`respond to ${key} deleted`);
			return;
		}

		res.reply('respond not found');
	});

	robot.respond(/list\s+responds/, (res) => {
		const responds = Responds.getAll();

		if (!responds.length) {
			return res.reply('No respond has been set yet.');
		}

		res.reply(responds.map((respond) => `respond to ${respond.name} with ${respond.value}`).join('\n'));
	});

	robot.respond(/(here\s+)?respond\s+to\s+(.+?)\s+with\s+(.+)/i, (res) => {
		setMessageHandled(res);

		const key = normalizeTrigger(res.match[2]);
		const value = res.match[3].trim();
		const here = !!res.match[1];

		let updated = false;

		// delete previous respond
		if (Responds.findOne({ name: key })) {
			Responds.remove({ name: key, room: res.message.room });
			updated = true;
		}

		// by postponing add, the robot listen will not respond to the query.
		Responds.upsert({ name: key, value, room: here && res.message.room || null });

		res.reply(updated ? 'Respond updated' : 'Respond added');
		robot.logger.debug(`new respond added ${key}=${value}`);
	});

	robot.listen((res) => {
		if (!res.text || res[respondHandled]) {
			return null;
		}

		const responds = Responds.getAll();

		if (responds.length < 1) {
			return null;
		}

		return Responds.findOne({ match: res.text, room: res.room });
	}, (res) => {
		const match = res.match;
		const text = match.value;

		const allowedInRoom = isMessageAllowedInRoom(res.message.room, match);

		if (allowedInRoom) {
			res.send(formatMessage(text, { sender: res.message.user.name, room: res.message.room }));

			robot.logger.debug(`respond matched: ${match}`);
		}
	});
};
