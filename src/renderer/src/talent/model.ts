import { TALENT_TYPES, type CanvasNode, type CanvasNodeType, type TalentType } from '@shared/types'

export function isTalentType(type: CanvasNodeType): type is TalentType {
  return (TALENT_TYPES as readonly string[]).includes(type)
}

export function isTalent(node: Pick<CanvasNode, 'type'>): boolean {
  return isTalentType(node.type)
}
