import * as assert from 'assert'
import * as postcss from 'postcss'
import parseSelector from 'postcss-selector-parser'
import * as selectorParser from 'postcss-selector-parser'

export function transformStyle(root: postcss.Root): Style {
  if (!root.nodes) {
    return { body: [] }
  }
  const body = root.nodes
    .map(node => {
      switch (node.type) {
        case 'atrule':
          return transformAtRule(node)
        case 'rule':
          return transformRule(node)
        default:
          return undefined
      }
    })
    .filter((node): node is AtRule | Rule => {
      return node !== undefined
    })

  return { body }
}

function transformAtRule(atRule: postcss.AtRule): AtRule {
  return {
    type: 'AtRule',
    name: atRule.name,
    params: atRule.params,
    children: []
  }
}

function transformRule(rule: postcss.Rule): Rule {
  const decls = rule.nodes ? rule.nodes.filter(isDeclaration) : []
  const root = parseSelector().astSync(rule.selector)

  return {
    type: 'Rule',
    selectors: root.nodes.map(n => {
      // A child of root node is always selector
      const selectors = (n as selectorParser.Selector).nodes
      return transformSelector(selectors)
    }),
    declarations: decls.map(transformDeclaration)
  }
}

function transformSelector(selector: selectorParser.Node[]): Selector {
  return {
    type: 'Selector',
    last: transformSelectorElements(selector)
  }
}

function transformSelectorElements(
  nodes: selectorParser.Node[]
): SelectorElement {
  const [first, ...tail] = nodes
  return transformSelectorElement(emptySelectorElement(), first, tail)
}

function transformSelectorElement(
  current: SelectorElement,
  el: selectorParser.Node | undefined,
  rest: selectorParser.Node[]
): SelectorElement {
  if (!el) {
    return current
  }

  const [first, ...tail] = rest
  switch (el.type) {
    case 'combinator':
      const next = emptySelectorElement()
      next.leftCombinator = transformCombinator(el, current)
      return transformSelectorElement(next, first, tail)
    case 'pseudo':
      if (selectorParser.isPseudoElement(el)) {
        return transformPseudoElement(current, el, rest)
      }

      if (selectorParser.isPseudoClass(el)) {
        current.pseudoClass.push(transformPseudoClass(el))
      } else {
        assert.fail(
          "[style] Unexpected selector node: it has type 'pseudo' but neither pseudo element nor pseudo class."
        )
      }
      break
    case 'tag':
      current.tag = el.value
      break
    case 'id':
      current.id = el.value
      break
    case 'class':
      current.class.push(el.value)
      break
    case 'universal':
      current.universal = true
      break
    case 'attribute':
      current.attributes.push(transformAttribute(el))
      break
    default:
  }
  return transformSelectorElement(current, first, tail)
}

function transformPseudoClass(node: selectorParser.Pseudo): PseudoClass {
  const params = node.nodes as selectorParser.Selector[]

  return {
    type: 'PseudoClass',
    value: node.value.replace(/^:/, ''),
    params: params.map(p => transformSelector(p.nodes))
  }
}

function transformPseudoElement(
  parent: SelectorElement,
  el: selectorParser.Pseudo,
  rest: selectorParser.Node[]
): SelectorElement {
  const rawPseudoClass = takeWhile(rest, selectorParser.isPseudoClass)

  parent.pseudoElement = {
    type: 'PseudoElement',
    value: el.value.replace(/^:{1,2}/, ''),
    pseudoClass: rawPseudoClass.map(transformPseudoClass)
  }

  // No simple selector can follows after a paseudo element
  const [first, ...tail] = dropWhile(
    rest.slice(rawPseudoClass.length),
    el => !selectorParser.isCombinator(el)
  )

  return transformSelectorElement(parent, first, tail)
}

function transformAttribute(attr: selectorParser.Attribute): Attribute {
  return {
    type: 'Attribute',
    operator: attr.operator,
    name: attr.attribute,
    value: attr.value
  }
}

function transformCombinator(
  comb: selectorParser.Combinator,
  left: SelectorElement
): Combinator {
  return {
    type: 'Combinator',
    operator: comb.value,
    left
  }
}

function transformDeclaration(decl: postcss.Declaration): Declaration {
  return {
    type: 'Declaration',
    prop: decl.prop,
    value: decl.value,
    important: decl.important || false // decl.import is possibly undefined
  }
}

function transformChild(child: postcss.ChildNode): ChildNode {}

function emptySelectorElement(): SelectorElement {
  return {
    type: 'SelectorElement',
    universal: false,
    class: [],
    attributes: [],
    pseudoClass: []
  }
}

function isDeclaration(node: postcss.Node): node is postcss.Declaration {
  return node.type === 'decl'
}

function takeWhile<T, R extends T>(list: T[], fn: (value: T) => value is R): R[]
function takeWhile<T>(list: T[], fn: (value: T) => boolean): T[]
function takeWhile<T>(list: T[], fn: (value: T) => boolean): T[] {
  const res = []
  for (const item of list) {
    if (fn(item)) {
      res.push(item)
    } else {
      return res
    }
  }
  return res
}

function dropWhile<T>(list: T[], fn: (value: T) => boolean): T[] {
  const skip = takeWhile(list, fn)
  return list.slice(skip.length)
}

export interface Style {
  body: (AtRule | Rule)[]
}

export interface Rule {
  type: 'Rule'
  selectors: Selector[]
  declarations: Declaration[]
}

export interface Declaration {
  type: 'Declaration'
  prop: string
  value: string
  important: boolean
}

export interface AtRule {
  type: 'AtRule'
  name: string
  params: string
  children: ChildNode[]
}

export type ChildNode = AtRule | Rule | Declaration

export interface Selector {
  type: 'Selector'
  last: SelectorElement
}

export interface SelectorElement {
  type: 'SelectorElement'
  universal: boolean
  tag?: string
  id?: string
  class: string[]
  attributes: Attribute[]
  pseudoClass: PseudoClass[]
  pseudoElement?: PseudoElement
  leftCombinator?: Combinator
}

export interface PseudoClass {
  type: 'PseudoClass'
  value: string
  params?: Selector[]
}

export interface PseudoElement {
  type: 'PseudoElement'
  value: string
  pseudoClass: PseudoClass[]
}

export interface Attribute {
  type: 'Attribute'
  operator?: selectorParser.AttributeOperator
  name: string
  value?: string
}

export interface Combinator {
  type: 'Combinator'
  operator: string
  left: SelectorElement
}
