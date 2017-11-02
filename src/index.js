// istanbul ignore if
if (!Error.prepareStackTrace) {
	require('source-map-support/register');
}

import fs from 'fs';

/**
 * The Gawk version number.
 * @type {String}
 */
export const version = JSON.parse(fs.readFileSync(`${__dirname}/../package.json`, 'utf-8')).version;

/**
 * A list of built-in objects that should not be gawked.
 * @type {Array.<Object>}
 */
const builtIns = [
	process.env,
	Math,
	JSON
];
if (typeof Intl !== 'undefined') {
	builtIns.push(Intl);
}
if (typeof Reflect !== 'undefined') {
	builtIns.push(Reflect);
}

/**
 * Determines if the specified variable is gawked.
 *
 * @param {*} it - The variable to check.
 * @returns {Boolean}
 */
export function isGawked(it) {
	return !!(it && typeof it === 'object' && it.__gawk__ && typeof it.__gawk__ === 'object');
}

/**
 * Creates a gawk object that wraps the specified object.
 *
 * @param {*} value - A value to gawk.
 * @param {Array|Object} [parent] - The parent gawk object.
 * @returns {Array|Object|*}
 */
export default function gawk(value, parent) {
	if (parent !== undefined && !isGawked(parent)) {
		throw new TypeError('Expected parent to be gawked');
	}

	// only objects can be gawked and can't be a built-in object
	if (!value || typeof value !== 'object' || value instanceof Date || builtIns.indexOf(value) !== -1) {
		return value;
	}

	let gawked;

	if (typeof value.__gawk__ === 'object') {
		// already gawked
		if (value === parent) {
			throw new Error('The parent must not be the same object as the value');
		}
		gawked = value;
	} else {
		// gawk it!
		gawked = new Proxy(value, {
			set: (target, prop, value) => {
				if (prop === '__gawk__') {
					throw new Error('Cannot override property \'__gawk__\'');
				}

				// console.log('setting', prop, value);

				let changed = true;

				if (Object.prototype.hasOwnProperty.call(target, prop)) {
					changed = target[prop] !== value;
					const parents = isGawked(target[prop]) && target[prop].__gawk__.parents;
					if (parents) {
						parents.delete(gawked);
						if (!parents.size) {
							target[prop].__gawk__.parents = null;
						}
					}
					if (!Array.isArray(target) || prop !== 'length') {
						delete target[prop];
					}
				}

				target[prop] = gawk(value, gawked);

				if (changed) {
					notify(gawked);
				}

				return true;
			},

			deleteProperty: (target, prop) => {
				if (prop === '__gawk__') {
					throw new Error('Cannot delete property \'__gawk__\'');
				}

				// console.log('deleting', prop, target[prop]);

				let result = true;

				if (target.hasOwnProperty(prop)) {
					const parents = isGawked(target[prop]) && target[prop].__gawk__.parents;
					if (parents) {
						parents.delete(gawked);
						if (!parents.size) {
							target[prop].__gawk__.parents = null;
						}
					}

					result = delete target[prop];
					if (result) {
						notify(gawked);
					}
				}

				return result;
			}
		});

		Object.defineProperty(gawked, '__gawk__', {
			value: {
				/**
				 * A map of listener functions to call invoke when a change occurs. The associated
				 * key value is the optional filter to apply to the listener.
				 * @type {Map}
				 */
				listeners: null,

				/**
				 * A list of all the gawk object's parents. These parents are notified when a change
				 * occurs.
				 * @type {Set}
				 */
				parents: null,

				/**
				 * A map of listener functions to the last known hash of the stringified value. This
				 * is used to detect if a filtered watch should be notified.
				 * @type {WeakMap}
				 */
				previous: null,

				/**
				 * A list of child objects that are modified while paused.
				 * @type {Set}
				 */
				queue: null,

				/**
				 * The Gawk version. This is helpful for identifying the revision of this internal
				 * structure.
				 * @type {String}
				 */
				version,

				/**
				 * Dispatches change notifications to the listeners.
				 */
				pause: function pause() {
					if (!this.queue) {
						this.queue = new Set();
					}
				},

				/**
				 * Unpauses the gawk notifications and sends out any pending notifications.
				 */
				resume: function resume() {
					if (this.queue) {
						const queue = this.queue;
						this.queue = null;
						for (const instance of queue) {
							notify(gawked, instance);
						}
					}
				}
			}
		});

		// gawk any object properties
		for (const key of Object.getOwnPropertyNames(gawked)) {
			if (key !== '__gawk__' && gawked[key] && typeof gawked[key] === 'object') {
				gawked[key] = gawk(gawked[key], gawked);
			}
		}

		if (Array.isArray(value)) {
			// some array functions do not invoke the delete handler, so we need to override the
			// method and do it ourselves
			const origPop = value.pop;
			const origShift = value.shift;
			const origSplice = value.splice;
			const origUnshift = value.unshift;

			Object.defineProperties(value, {
				pop: {
					configurable: true,
					value: function pop() {
						this.__gawk__.pause();
						const item = origPop.call(this);
						this.__gawk__.resume();
						return item;
					}
				},

				shift: {
					configurable: true,
					value: function shift() {
						this.__gawk__.pause();
						const item = origShift.call(this);
						this.__gawk__.resume();
						return item;
					}
				},

				splice: {
					configurable: true,
					value: function splice(start, deleteCount, ...items) {
						this.__gawk__.pause();

						if (start !== undefined && deleteCount === undefined) {
							deleteCount = this.length - start;
						}

						const arr = origSplice.call(this, start, deleteCount, ...items);
						for (let i = start + items.length; i < this.length; i++) {
							if (this[i] && typeof this[i] === 'object') {
								this[i] = gawk(this[i], this);
							}
						}

						for (const item of arr) {
							if (isGawked(item) && item.__gawk__.parents) {
								item.__gawk__.parents.delete(this);
							}
						}

						this.__gawk__.resume();
						return arr;
					}
				},

				unshift: {
					configurable: true,
					value: function unshift(...items) {
						this.__gawk__.pause();
						const len = origUnshift.apply(this, items.map(item => gawk(item, this)));
						this.__gawk__.resume();
						return len;
					}
				}
			});
		}
	}

	if (parent) {
		if (!gawked.__gawk__.parents) {
			gawked.__gawk__.parents = new Set();
		}
		gawked.__gawk__.parents.add(parent);
	}

	return gawked;
}

export { gawk as gawk };

/**
 * Dispatches change notifications to the listeners.
 *
 * @param {Object} gobj - The gawked object.
 * @param {Object|Array} [source] - The gawk object that was modified.
 */
function notify(gobj, source) {
	const state = gobj.__gawk__;

	if (source === undefined) {
		source = gobj;
	}

	// if we're paused, add this object to the list of objects that changed
	if (state.queue) {
		state.queue.add(gobj);
		return;
	}

	// notify all of this object's listeners
	if (state.listeners) {
		for (const [ listener, filter ] of state.listeners) {
			if (filter) {
				let obj = gobj;
				let found = true;

				// find the value we're interested in
				for (let i = 0, len = filter.length; obj && typeof obj === 'object' && i < len; i++) {
					if (!obj.hasOwnProperty(filter[i])) {
						found = false;
						obj = undefined;
						break;
					}
					obj = obj[filter[i]];
				}

				// compute the hash of the stringified value
				const str = JSON.stringify(obj) || '';
				let hash = 5381;
				let i = str.length;
				while (i) {
					hash = (hash * 33) ^ str.charCodeAt(--i);
				}
				hash = hash >>> 0;

				// check if the value changed
				if ((found && !state.previous) || (state.previous && hash !== state.previous.get(listener))) {
					listener(obj, source);
				}

				if (!state.previous) {
					state.previous = new WeakMap();
				}

				state.previous.set(listener, hash);
			} else {
				listener(gobj, source);
			}
		}
	}

	// notify all of this object's parents
	if (state.parents) {
		for (const parent of state.parents) {
			notify(parent, source);
		}
	}
}

/**
 * Copies listeners from a source gawked object ot a destination gawked object. Note that the
 * arguments must both be objects and only the `dest` is required to already be gawked.
 *
 * @param {Object|Array} dest - A gawked object to copy the listeners to.
 * @param {Object|Array} src - An object to copy the listeners from.
 */
function copyListeners(dest, src) {
	if (isGawked(src) && src.__gawk__.listeners) {
		if (dest.__gawk__.listeners) {
			for (const [ listener, filter ] of src.__gawk__.listeners) {
				dest.__gawk__.listeners.set(listener, filter);
			}
		} else {
			dest.__gawk__.listeners = new Map(src.__gawk__.listeners);
		}
	}
}

/**
 * A helper function for replacing the contents of one gawked object with another. It takes care of
 * recursively gawking all decending objects and copying listeners over.
 *
 * @param {Object|Array} dest - The destination gawked object or array.
 * @param {Object|Array} src - The source object or array.
 * @param {Function} [compareFn] - A function to call to compare a source and destination to check if
 * they are the same.
 * @returns {Object|Array} Returns the destination gawked object.
 */
gawk.set = function set(dest, src, compareFn) {
	if (!dest || typeof dest !== 'object') {
		throw new TypeError('Expected destination to be an object');
	}

	if (!src || typeof src !== 'object') {
		// source is not an object, so just return it
		return src;
	}

	if (!compareFn) {
		compareFn = (dest, src) => {
			// note: we purposely do non-strict equality
			return (typeof dest === 'object' ? dest.valueOf() : dest) == (typeof src === 'object' ? src.valueOf() : src);
		};
	} else if (typeof compareFn !== 'function') {
		throw new TypeError('Expected compare callback to be a function');
	}

	const walk = (dest, src, quiet) =>  {
		// suspend notifications if the dest is a new gawk object
		if (!quiet) {
			dest.__gawk__.pause();
		}

		if (Array.isArray(src)) {
			// istanbul ignore if
			if (!Array.isArray(dest)) {
				throw new Error('Source is an array and expected dest to also be an array');
			}

			const destCopy = [ ...dest ];
			const tmp = [];

			for (let i = 0, len = src.length; i < len; i++) {
				let srcValue = src[i];
				const srcValueIsObject = srcValue !== null && typeof srcValue === 'object';

				for (let j = 0; j < destCopy.length; j++) {
					const destValue = destCopy[j];

					if (srcValueIsObject && destValue !== null && typeof destValue === 'object') {
						if (compareFn(destValue, srcValue)) {
							destCopy.splice(j, 1);
							srcValue = gawk.mergeDeep(gawk(Array.isArray(srcValue) ? [] : {}), srcValue);
							copyListeners(srcValue, destValue);
						}
					} else if (compareFn(destValue, srcValue)) {
						destCopy.splice(j, 1);
					}
				}

				tmp.push(srcValue);
			}

			// replace the contents of dest with that of tmp
			// note that this will call the proxy method and handle the parent wireup for us
			dest.splice(0, dest.length, ...tmp);

		} else {
			// istanbul ignore if
			if (!dest || typeof dest !== 'object') {
				throw new Error('Source is an object and expected dest to also be an object');
			}

			const tmp = {};

			for (const key of Object.getOwnPropertyNames(src)) {
				if (key === '__gawk__') {
					continue;
				}

				const srcValue = src[key];

				// if the source value is not an object, return it now
				if (srcValue === null || typeof srcValue !== 'object') {
					tmp[key] = srcValue;
					continue;
				}

				// create a new dest object to copy the source into
				const destValue = gawk(Array.isArray(srcValue) ? [] : {});
				tmp[key] = walk(destValue, srcValue, !dest.hasOwnProperty(key));
			}

			// prune the existing object, then copy all the properties from our temp object
			for (const key of Object.getOwnPropertyNames(dest)) {
				if (key !== '__gawk__') {
					delete dest[key];
				}
			}
			Object.assign(dest, tmp);
		}

		// copy the listeners
		copyListeners(dest, src);

		// resume and send out change notifications
		dest.__gawk__.resume();

		return dest;
	};

	const destIsArray = Array.isArray(dest);
	const srcIsArray = Array.isArray(src);

	if (destIsArray !== srcIsArray) {
		// the type changed and there's no clear way to compare them, so just return a gawked clone
		// of the source
		dest = srcIsArray ? [] : {};
	}

	const gawked = isGawked(dest);

	return walk(gawked ? dest : gawk(dest), src, !gawked);
};

/**
 * Adds a listener to be called when the specified object or any of its properties/elements are
 * changed.
 *
 * @param {Object|Array} subject - The object to watch.
 * @param {String|Array.<String>} [filter] - A property name or array of nested properties to watch.
 * @param {Function} listener - The function to call when something changes.
 * @returns {Object|Array} Returns a gawked object or array depending on the input object.
 */
gawk.watch = function watch(subject, filter, listener) {
	if (!isGawked(subject)) {
		throw new TypeError('Expected subject to be gawked');
	}

	if (typeof filter === 'function') {
		listener = filter;
		filter = null;
	}

	if (filter) {
		if (typeof filter === 'string') {
			filter = [ filter ];
		} else if (!Array.isArray(filter)) {
			throw new TypeError('Expected filter to be a string or array of strings');
		}
	}

	if (typeof listener !== 'function') {
		throw new TypeError('Expected listener to be a function');
	}

	if (!subject.__gawk__.listeners) {
		subject.__gawk__.listeners = new Map();
	}
	subject.__gawk__.listeners.set(listener, filter);

	return subject;
};

/**
 * Removes a listener from the specified gawked object.
 *
 * @param {Object|Array} subject - The object to unwatch.
 * @param {Function} [listener] - The function to call when something changes.
 * @returns {Object|Array} Returns a gawked object or array depending on the input object.
 */
gawk.unwatch = function unwatch(subject, listener) {
	if (!isGawked(subject)) {
		throw new TypeError('Expected subject to be gawked');
	}

	if (listener && typeof listener !== 'function') {
		throw new TypeError('Expected listener to be a function');
	}

	const g = subject.__gawk__;

	if (g.listeners) {
		if (listener) {
			g.listeners.delete(listener);
			if (g.previous) {
				g.previous.delete(listener);
			}
		} else {
			// remove all listeners
			for (const [ listener, filter ] of g.listeners) {
				g.listeners.delete(listener);
				if (g.previous) {
					g.previous.delete(listener);
				}
			}
		}

		if (!g.listeners.size) {
			g.listeners = null;
			g.previous = null;
		}
	}

	return subject;
};

/**
 * Mixes an array of objects or gawked objects into the specified gawked object.
 *
 * @param {Array.<Object>} objs - An array of objects or gawked objects.
 * @param {Boolean} [deep=false] - When true, mixes subobjects into each other.
 * @returns {Object}
 */
function mix(objs, deep) {
	const gobj = gawk(objs.shift());
	if (!isGawked(gobj) || Array.isArray(gobj)) {
		throw new TypeError('Expected destination to be a gawked object');
	}

	if (!objs.length) {
		return gobj;
	}

	// validate the objects are good
	for (const obj of objs) {
		if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
			throw new TypeError('Expected merge source to be an object');
		}
	}

	// we need to detach the parent and all listeners so that they will be notified after everything
	// has been merged
	gobj.__gawk__.pause();

	/**
	 * Mix an object or gawked object into a gawked object.
	 * @param {Object} gobj - The destination gawked object.
	 * @param {Object} src - The source object to copy from.
	 */
	const mixer = (gobj, src) => {
		for (const key of Object.getOwnPropertyNames(src)) {
			if (key === '__gawk__') {
				continue;
			}

			const srcValue = src[key];

			if (deep && srcValue !== null && typeof srcValue === 'object' && !Array.isArray(srcValue)) {
				if (!isGawked(gobj[key])) {
					gobj[key] = gawk({}, gobj);
				}
				mixer(gobj[key], srcValue);
			} else if (Array.isArray(gobj[key]) && Array.isArray(srcValue)) {
				// overwrite destination with new values
				gobj[key].splice(0, gobj[key].length, ...srcValue);
			} else {
				gobj[key] = gawk(srcValue, gobj);
			}
		}
	};

	for (const obj of objs) {
		mixer(gobj, obj);
	}

	gobj.__gawk__.resume();

	return gobj;
}

/**
 * Performs a shallow merge of one or more objects into the specified gawk object.
 *
 * @param {...Object} objs - The destination object followed by one or more objects to merge in.
 * @returns {Object}
 */
gawk.merge = function merge(...objs) {
	return mix(objs);
};

/**
 * Performs a deep merge of one or more objects into the specified gawk object.
 *
 * @param {...Object} objs - The destination object followed by one or more objects to deeply merge in.
 * @returns {Object}
 */
gawk.mergeDeep = function mergeDeep(...objs) {
	return mix(objs, true);
};
