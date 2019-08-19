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

	let brain;

	let responds = [];

	const respondHandled = Symbol('respond handled');

	function formatMessage(str, args) {
		return str.replace(/(\{[a-zA-Z0-9]+\})/g, function (i) {
			var key = i.slice(1, -1);
			if (key in args) {
				return args[key];
			}

			return i;
		});
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

	function refreshResponds () {
		const all = brain.getAll();
		responds = Array.from(new Set(all.map(a => a[0])));
	}

	function normalizeTrigger (trigger) {
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

	brain = (function () {
		if (!robot.brain.get('responds')) {
			robot.brain.set('responds', Object.create(null));
		}

		robot.brain.on('loaded', refreshResponds);

		robot.brain.once('loaded', migrate);

		return {
			get (name) {
				let responds = robot.brain.get('responds');
				return responds && responds[name];
			},

			set (name, value) {
				let responds = robot.brain.get('responds') || Object.create(null);
				responds[name] = value;
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

				return Object.keys(responds).map((name) => [name, responds[name]]);
			},

			getRespondRooms (name) {
				const respondRooms = robot.brain.get('respondRooms') || Object.create(null);

				return respondRooms[name];
			},

			setRoom (name, room) {
				let respondRooms = robot.brain.get('respondRooms') || Object.create(null);
				robot.brain.set('respondRooms', new Set([room].concat(respondRooms[name])));
			},

			unsetRoom (name, room) {
				let respondRooms = robot.brain.get('respondRooms') || Object.create(null);
				const currentRooms = new Set(respondRooms[name]);
				currentRooms.delete(room);

				if (currentRooms.size > 0) {
					respondRooms[name] = currentRooms;
				} else {
					delete respondRooms[name];
				}

				robot.brain.set('respondRooms', respondRooms);
			},
		};
	}());

	robot.respond(/delete\s+respond\s+to\s+(.+)/, (res) => {
		let key = normalizeTrigger(res.match[1]);

		if (brain.get(key)) {
			brain.unset(key);

			res.reply(`respond to ${key} deleted`);
		}
	});

	robot.respond(/list\s+responds/, (res) => {
		let responds = brain.getAll();

		if (!responds.length) {
			return res.reply('No respond has been set yet.');
		}

		res.reply(responds.map((respond) => `respond to ${respond[0]} with ${respond[1]}`).join('\n'));
	});

	robot.respond(/(here\s+)?respond\s+to\s+(.+)\s+with\s+(.+)/i, (res) => {
		setMessageHandled(res);

		let key = normalizeTrigger(res.match[2]),
			value = res.match[3].trim(),
			here = !!res.match[1],
			updated = false;

		// delete previous respond
		if (brain.get(key)) {
			brain.unset(key);
			updated = true;
		}

		// by postponing add, the robot listen will not respond to the query.
		brain.set(key, value);

		if (here) {
			brain.setRoom(key, res.message.room);
		}

		res.reply(updated ? 'Respond updated' : 'Respond added');
		robot.logger.debug(`new respond added ${key}=${value}`);
	});

	robot.listen((res) => {
		if (!res.text || responds.length < 1 || res[respondHandled]) {
			return null;
		}

		const match = Array.from(responds).find((matcher) => {
			const re = createRespondRegexp(matcher);
			return re.test(res.text);
		});

		return match && match.toLowerCase();
	}, (res) => {
		const match = res.match;
		const text = brain.get(res.match);
		const respondRooms = brain.getRespondRooms(match);

		const allowedInRoom = !respondRooms || respondRooms.includes(res.message.room);

		if (allowedInRoom) {
			res.send(formatMessage(text, { sender: res.message.user.name, room: res.message.room }));

			robot.logger.debug(`respond matched: ${match}`);
		}
	});
};
