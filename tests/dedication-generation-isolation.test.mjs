import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import ts from 'typescript'

const source = readFileSync(new URL('../components/PersonalizePage.tsx', import.meta.url), 'utf8')
const file = ts.createSourceFile('PersonalizePage.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)

function propertyName(node) {
  return (ts.isIdentifier(node) || ts.isStringLiteral(node)) ? node.text : null
}

test('Preview generation textOverrides never carries a dedication property', () => {
  const offendingLines = []

  function inspectOverrides(node) {
    if (!ts.isObjectLiteralExpression(node)) return
    for (const property of node.properties) {
      if (ts.isPropertyAssignment(property) && propertyName(property.name) === 'dedication') {
        offendingLines.push(file.getLineAndCharacterOfPosition(property.getStart(file)).line + 1)
      }
    }
  }

  function visit(node) {
    if (ts.isVariableDeclaration(node) && propertyName(node.name) === 'textOverrides' && node.initializer) {
      inspectOverrides(node.initializer)
    }
    if (ts.isPropertyAssignment(node) && propertyName(node.name) === 'textOverrides') {
      inspectOverrides(node.initializer)
    }
    ts.forEachChild(node, visit)
  }

  visit(file)
  assert.deepEqual(offendingLines, [])
})
