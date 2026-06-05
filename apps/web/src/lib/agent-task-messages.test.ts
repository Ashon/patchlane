import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  detectJson,
  formatJson,
  truncateForPreview,
} from './agent-task-messages'

describe('detectJson', () => {
  it('detects JSON objects', () => {
    const result = detectJson({ count: 42, foo: 'bar' })

    assert.equal(result.isJson, true)
    assert.equal(result.type, 'object')
    assert.deepEqual(result.parsed, { count: 42, foo: 'bar' })
  })

  it('detects JSON arrays', () => {
    const result = detectJson([1, 2, 3])

    assert.equal(result.isJson, true)
    assert.equal(result.type, 'array')
    assert.deepEqual(result.parsed, [1, 2, 3])
  })

  it('detects stringified JSON objects', () => {
    const result = detectJson('{"foo":"bar","count":42}')

    assert.equal(result.isJson, true)
    assert.equal(result.type, 'stringified')
    assert.deepEqual(result.parsed, { count: 42, foo: 'bar' })
  })

  it('detects stringified JSON arrays', () => {
    const result = detectJson('[1,2,3]')

    assert.equal(result.isJson, true)
    assert.equal(result.type, 'array')
    assert.deepEqual(result.parsed, [1, 2, 3])
  })

  it('returns false for non-JSON values', () => {
    assert.equal(detectJson('plain text').isJson, false)
    assert.equal(detectJson(42).isJson, false)
    assert.equal(detectJson(true).isJson, false)
    assert.equal(detectJson(null).isJson, false)
    assert.equal(detectJson(undefined).isJson, false)
    assert.equal(detectJson('{invalid json}').isJson, false)
    assert.equal(detectJson('"just a string"').isJson, false)
  })
})

describe('formatJson', () => {
  it('formats JSON with readable indentation', () => {
    const result = formatJson({ count: 42, foo: 'bar' })

    assert.equal(
      result,
      `{
  "count": 42,
  "foo": "bar"
}`,
    )
  })

  it('handles primitives', () => {
    assert.equal(formatJson('string'), '"string"')
    assert.equal(formatJson(42), '42')
    assert.equal(formatJson(true), 'true')
    assert.equal(formatJson(null), 'null')
  })
})

describe('truncateForPreview', () => {
  it('keeps short JSON compact', () => {
    assert.equal(truncateForPreview({ foo: 'bar' }, 100), '{"foo":"bar"}')
  })

  it('summarizes long JSON objects with the first key and remaining count', () => {
    const result = truncateForPreview({ a: 1, b: 2, c: 3, d: 4, e: 5 }, 20)

    assert.equal(result, '{ "a": 1 } +4 more')
  })

  it('summarizes long JSON arrays with the first item and remaining count', () => {
    const result = truncateForPreview([1, 2, 3, 4, 5], 8)

    assert.equal(result, '[1] +4 more')
  })

  it('truncates long stringified JSON and non-JSON strings', () => {
    assert.equal(truncateForPreview('{"a":1,"b":2,"c":3}', 10), '{"a":1,...')
    assert.equal(
      truncateForPreview('this is a very long string', 20),
      'this is a very lo...',
    )
  })
})
