import { describe, expect, it } from 'vitest';
import { slugify } from '../../src/domain/slug.js';

describe('slugify', () => {
  it('lowercases, replaces spaces/punctuation with dashes, and appends the year', () => {
    expect(slugify('The Matrix', 1999)).toBe('the-matrix-1999');
  });

  it('strips accents', () => {
    expect(slugify('Léon', 1994)).toBe('leon-1994');
  });

  it('collapses consecutive non-alphanumeric characters into a single dash', () => {
    expect(slugify("Ocean's Eleven!!", 2001)).toBe('ocean-s-eleven-2001');
  });

  it('trims leading/trailing dashes from punctuation at the edges', () => {
    expect(slugify('---Weird Title---', 2020)).toBe('weird-title-2020');
  });
});
