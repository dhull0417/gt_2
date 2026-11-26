import { linkify } from '../linkify';

const links = (s: string) => linkify(s).filter((x) => x.kind !== 'text').map((x) => [x.kind, x.text, x.value]);

describe('linkify', () => {
  it('returns plain text untouched', () => {
    expect(linkify('see you at 7')).toEqual([{ text: 'see you at 7', kind: 'text' }]);
  });
  it('finds urls and trims trailing punctuation', () => {
    expect(links('go to https://zoom.us/j/123, ok?')).toEqual([['url', 'https://zoom.us/j/123', 'https://zoom.us/j/123']]);
    expect(links('www.example.com.')).toEqual([['url', 'www.example.com', 'https://www.example.com']]);
    expect(links('(https://en.wikipedia.org/wiki/Foo_(bar))')).toEqual([['url', 'https://en.wikipedia.org/wiki/Foo_(bar)', 'https://en.wikipedia.org/wiki/Foo_(bar)']]);
  });
  it('finds emails without also matching the domain as a url', () => {
    expect(links('mail bob@site.com now')).toEqual([['email', 'bob@site.com', 'bob@site.com']]);
  });
  it('finds phone numbers', () => {
    expect(links('call (801) 555-1234')).toEqual([['phone', '(801) 555-1234', '8015551234']]);
    expect(links('801-555-1234')[0][0]).toBe('phone');
  });
  it('finds street addresses', () => {
    expect(links('meet at 123 N Main St tonight')[0]).toEqual(['address', '123 N Main St', '123 N Main St']);
    expect(links('4500 South State Street, Salt Lake City, UT 84107!')[0][0]).toBe('address');
  });
  it('does not linkify plain numbers or times', () => {
    expect(links('we are 5 people at 7:30, bring 2 chairs')).toEqual([]);
  });
  it('preserves all text', () => {
    const t = 'hi bob@x.com or 801-555-1234 at https://a.co/x. bye';
    expect(linkify(t).map((s) => s.text).join('')).toBe(t);
  });
});
