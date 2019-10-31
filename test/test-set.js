import gawk, { isGawked } from '../dist/index';

describe('gawk.set()', () => {
	it('should error if dest is not an object', () => {
		expect(() => {
			gawk.set(undefined, {});
		}).to.throw(TypeError, 'Expected destination to be an object');

		expect(() => {
			gawk.set(null, {});
		}).to.throw(TypeError, 'Expected destination to be an object');

		expect(() => {
			gawk.set(123, {});
		}).to.throw(TypeError, 'Expected destination to be an object');
	});

	it('should return source if source is not an object', () => {
		expect(gawk.set({}, undefined)).to.be.undefined;
		expect(gawk.set({}, null)).to.be.null;
		expect(gawk.set({}, 123)).to.equal(123);
		expect(gawk.set({}, 'foo')).to.equal('foo');
	});

	it('should error if compare is not a function', () => {
		expect(() => {
			gawk.set({}, {}, 123);
		}).to.throw(TypeError, 'Expected compare callback to be a function');

		expect(() => {
			gawk.set({}, {}, 'foo');
		}).to.throw(TypeError, 'Expected compare callback to be a function');

		expect(() => {
			gawk.set({}, {}, {});
		}).to.throw(TypeError, 'Expected compare callback to be a function');
	});

	it('should overwrite an existing property', () => {
		const src = { foo: 'baz' };
		const dest = gawk.set(gawk({ foo: 'bar' }), src);
		expect(dest).to.deep.equal(src);
	});

	it('should remove obsolete properties', () => {
		const src = { baz: 'wiz' };
		const dest = gawk.set(gawk({ foo: 'bar' }), src);
		expect(dest).to.deep.equal(src);
	});

	it('should set a non-gawked object to another non-gawked object', () => {
		const src = { foo: 'bar', baz: { a: 1, b: null }, arr: [ 'a', 'b', { c: 'd' } ] };
		const dest = gawk.set({}, src);
		expect(isGawked(dest)).to.be.true;
		expect(dest).to.deep.equal(src);
	});

	it('should set a gawked object to a non-gawked object', () => {
		const src = { foo: 'bar', baz: { a: 1, b: null }, arr: [ 'a', 'b', { c: 'd' } ] };
		const dest = gawk.set({}, src);
		expect(dest).to.deep.equal(src);
	});

	it('should set a non-gawked object to a gawked object', () => {
		const src = { foo: 'bar', baz: { a: 1, b: null }, arr: [ 'a', 'b', { c: 'd' } ] };
		const dest = gawk.set(gawk({}), src);
		expect(dest).to.deep.equal(src);
	});

	it('should replace array with an object', () => {
		const src = { foo: 'bar', baz: { a: 1, b: null }, arr: [ 'a', 'b', { c: 'd' } ] };
		const dest = gawk.set(gawk([]), src);
		expect(dest).to.deep.equal(src);
	});

	it('should replace object with an array', () => {
		const src = [ 'a', 'b', 'c' ];
		const dest = gawk.set(gawk({}), src);
		expect(dest).to.deep.equal(src);
	});

	it('should change a object property from non-object to object', () => {
		const src = { a: { b: 2 } };
		const dest = gawk.set(gawk({ a: 1 }), src);
		expect(dest).to.deep.equal(src);
	});

	it('should overwrite object property object value with new object', () => {
		const src = { a: { b: 2 } };
		const dest = gawk.set(gawk({ a: { b: 1 } }), src);
		expect(dest).to.deep.equal(src);
	});

	it('should copy over listeners', () => {
		const src = { foo: 'bar', baz: { a: 1, b: null }, arr: [ 'a', 'b', { c: 'd' } ] };
		const gsrc = gawk(src);
		let count1 = 0;
		let count2 = 0;
		let count3 = 0;

		gawk.watch(gsrc, () => {
			count1++;
		});
		gawk.watch(gsrc.baz, obj => {
			count2++;
		});
		gawk.watch(gsrc.arr[2], () => {
			count3++;
		});

		expect(gsrc.__gawk__.listeners).to.be.instanceof(Map);
		expect(gsrc.__gawk__.listeners.size).to.equal(1);
		expect(gsrc.arr.__gawk__.listeners).to.be.null;
		expect(gsrc.arr).to.be.an('array');
		expect(gsrc.arr).to.have.lengthOf(3);
		expect(gsrc.arr[2].__gawk__.listeners).to.be.instanceof(Map);
		expect(gsrc.arr[2].__gawk__.listeners.size).to.equal(1);

		const dest = gawk.set(gawk({}), src);
		expect(dest).to.deep.equal(src);

		expect(dest.__gawk__.listeners).to.be.instanceof(Map);
		expect(dest.__gawk__.listeners.size).to.equal(1);
		expect(dest.baz.__gawk__.listeners).to.be.instanceof(Map);
		expect(dest.baz.__gawk__.listeners.size).to.equal(1);
		expect(dest.arr.__gawk__.listeners).to.be.null;
		expect(dest.arr).to.be.an('array');
		expect(dest.arr).to.have.lengthOf(3);
		expect(dest.arr[2].__gawk__.listeners).to.be.instanceof(Map);
		expect(dest.arr[2].__gawk__.listeners.size).to.equal(1);

		expect(count1).to.equal(1);
		expect(count2).to.equal(0);
		expect(count3).to.equal(0);
	});

	it('should copy an array of strings using default compare function', () => {
		const src = [ 'c', 'a' ];
		const dest = gawk.set(gawk([ 'a', 'b' ]), src);
		expect(isGawked(dest)).to.be.true;
		expect(dest).to.deep.equal(src);
	});

	it('should copy an array of objects using default compare function', () => {
		class Letter {
			constructor(letter) {
				this.letter = letter;
			}

			valueOf() {
				return this.letter;
			}
		}

		const src = [ new Letter('c'), new Letter('a') ];
		const dest = gawk.set(gawk([ new Letter('a'), new Letter('b') ]), src);
		expect(isGawked(dest)).to.be.true;
		expect(dest).to.deep.equal(src);
	});

	it('should copy an array of strings and objects using default compare function', () => {
		class Letter {
			constructor(letter) {
				this.letter = letter;
			}

			valueOf() {
				return this.letter;
			}
		}

		const src = [ new Letter('c'), 'a' ];
		const dest = gawk.set(gawk([ new Letter('a'), 'b' ]), src);
		expect(isGawked(dest)).to.be.true;
		expect(dest).to.deep.equal(src);
	});


	it('should call compare function to check objects', () => {
		const dest = gawk([ { a: 1 } ]);
		let count1 = 0;
		let count2 = 0;

		gawk.watch(dest, (obj) => {
			count1++;
		});
		gawk.watch(dest[0], () => {
			count2++;
		});

		expect(dest.__gawk__.listeners).to.be.instanceof(Map);
		expect(dest.__gawk__.listeners.size).to.equal(1);

		expect(dest[0].__gawk__.listeners).to.be.instanceof(Map);
		expect(dest[0].__gawk__.listeners.size).to.equal(1);

		dest[0].a = 2;

		expect(count1).to.equal(1);
		expect(count2).to.equal(1);

		dest.push({ b: 1 });

		expect(count1).to.equal(2);
		expect(count2).to.equal(1);

		gawk.set(dest, [ { a: 5 }, { c: 1 } ], (dest, src) => { return dest.a && src.a; });

		expect(count1).to.equal(3);
		expect(count2).to.equal(1);

		expect(dest.__gawk__.listeners).to.be.instanceof(Map);
		expect(dest.__gawk__.listeners.size).to.equal(1);

		expect(dest[0].__gawk__.listeners).to.be.instanceof(Map);
		expect(dest[0].__gawk__.listeners.size).to.equal(1);

		dest[0].a = 6;

		expect(count1).to.equal(4);
		expect(count2).to.equal(2);
	});

	it('should combine source listeners with existing dest listeners', () => {
		const dest = gawk({});
		const src = gawk({});
		let count1 = 0;
		let count2 = 0;

		gawk.watch(dest, () => {
			count1++;
		});
		expect(dest.__gawk__.listeners.size).to.equal(1);

		gawk.watch(src, () => {
			count2++;
		});
		expect(src.__gawk__.listeners.size).to.equal(1);

		gawk.set(dest, src);

		expect(dest.__gawk__.listeners.size).to.equal(2);

		expect(count1).to.equal(0);
		expect(count2).to.equal(0);

		dest.a = 1;

		expect(count1).to.equal(1);
		expect(count2).to.equal(1);
	});

	it('should deeply copy listeners', () => {
		const dest = gawk([]);

		const dest2 = gawk([]);

		const arr1 = [
			{
				a: 'i',
				b: 11,
				c: [ 'a', 'b', { dd: 'ee' } ],
				d: 'e',
				g: 'j',
				h: false,
				n: {
					o: 's',
					p: 't',
					q: 'u',
					r: 'v'
				}
			},
			{
				a: 'i',
				b: 65,
				d: 'f',
				g: 'k',
				h: false,
				n: {
					o: 'w',
					p: 'x',
					q: 'y',
					r: 'z'
				}
			},
			{
				a: 'i',
				b: 92,
				d: 'm',
				g: 'l',
				h: false,
				n: {
					o: 'aa',
					p: 'bb',
					q: 'cc',
					r: 'dd'
				}
			}
		];

		const arr2 = [
			{
				a: 'i',
				b: 11,
				c: [ 'a', 'b', { dd: 'ee' } ],
				n: {
					o: 's',
					p: 't',
					q: 'u',
					r: 'v'
				},
				d: 'e',
				g: 'j',
				h: false
			},
			{
				a: 'i',
				b: 92,
				n: {
					o: 'aa',
					p: 'bb',
					q: 'cc',
					r: 'dd'
				},
				d: 'm',
				g: 'l',
				h: false
			}
		];

		gawk.watch(dest, obj => {
			gawk.set(dest2, obj);
		});

		gawk.set(dest, arr1);

		gawk.watch(dest[0].c[2], () => {});

		gawk.set(dest, arr2);

		expect(dest).to.deep.equal(arr2);
	});

	it('should fire listeners only once per set', () => {
		const gobj = gawk({});
		let counter = 0;

		gawk.watch(gobj, () => {
			counter++;
		});

		gawk.set(gobj, { foo: 'bar', baz: 'pow' });
		expect(counter).to.equal(1);
		expect(gobj).to.deep.equal({ foo: 'bar', baz: 'pow' });

		gawk.set(gobj, { foo: 'bar2', baz2: 'pow' });
		expect(counter).to.equal(2);
		expect(gobj).to.deep.equal({ foo: 'bar2', baz2: 'pow' });
	});

	it('should only fire events if the values change', () => {
		const arr = gawk([]);
		let counter = 0;

		gawk.watch(arr, () => {
			counter++;
		});

		gawk.set(arr, [
			{ id: 'a' },
			{ id: 'b' },
			{ id: 'c' },
			{ id: 'd' }
		]);
		expect(counter).to.equal(1);

		gawk.set(arr, [
			{ id: 'a' },
			{ id: 'b' },
			{ id: 'c' },
			{ id: 'd' }
		]);
		expect(counter).to.equal(1);

		gawk.set(arr, [
			{ id: 'a' },
			{ id: 'b' },
			{ id: 'd' },
			{ id: 'c' }
		]);
		expect(counter).to.equal(2);
	});

	it('should set an existing object with a symbol property', () => {
		const id = Symbol();

		const gobj = gawk({});

		gawk.set(gobj, { [id]: 'foo' });
		expect(Object.getOwnPropertySymbols(gobj)).to.deep.equal([ id ]);
		expect(gobj[id]).to.equal('foo');
	});

	it('should set an existing object with a symbol property', () => {
		const id = Symbol();

		const gobj = gawk({ [id]: 'foo' });
		expect(Object.getOwnPropertySymbols(gobj)).to.deep.equal([ id ]);
		expect(gobj[id]).to.equal('foo');

		gawk.set(gobj, { [id]: 'bar' });
		expect(Object.getOwnPropertySymbols(gobj)).to.deep.equal([ id ]);
		expect(gobj[id]).to.equal('bar');
	});
});
