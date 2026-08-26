import { describe, expect, it } from 'vitest'
import {
  completedLocalDayWindow,
  memoryContextFor,
  nextLocalMidnight,
  redactSensitiveText,
} from '../src/domain.ts'

describe('memory domain', () => {
  it('redacts secrets before any memory model sees selected context', () => {
    expect(redactSensitiveText('密码: hunter2\napi_key=sk-live-secret\n保留发布偏好'))
      .toBe('密码: [已移除敏感信息]\napi_key=[已移除敏感信息]\n保留发布偏好')
  })

  it('retrieves only relevant blocks with user memory before AI memory', () => {
    const context = memoryContextFor({
      query: '准备发布 DSH 插件，README 怎么处理？',
      cwd: '/work/dsh',
      userDocument: [
        '## DSH 发布\n\n适用项目：/work/dsh\n\n发布前必须同步中英文 README。',
        '## 饮食\n\n不吃香菜。',
      ].join('\n\n---\n\n'),
      aiDocument: [
        '## 发布习惯\n\n用户通常要求先做定向测试再发布。',
        '## 旅行\n\n偏好靠窗座位。',
      ].join('\n\n---\n\n'),
    })
    expect(context).toBeTypeOf('string')
    if (context === undefined) throw new Error('expected relevant memory context')
    expect(context).toContain('用户主动记忆')
    expect(context).toContain('同步中英文 README')
    expect(context).toContain('AI 主动记忆')
    expect(context).toContain('定向测试')
    expect(context).not.toContain('香菜')
    expect(context).not.toContain('靠窗')
    expect(context.indexOf('用户主动记忆')).toBeLessThan(context.indexOf('AI 主动记忆'))
  })

  it('injects nothing for a query with no material match', () => {
    expect(memoryContextFor({
      query: '解释这段 Rust 生命周期',
      cwd: '/work/rust',
      userDocument: '## 饮食\n\n不吃香菜。',
      aiDocument: '## 旅行\n\n偏好靠窗座位。',
    })).toBeUndefined()
  })

  it('schedules only the next local midnight instead of making startup overdue work', () => {
    const afternoon = new Date('2026-08-25T05:00:00.000Z') // 13:00 Asia/Shanghai
    expect(nextLocalMidnight(afternoon, 8 * 60).toISOString()).toBe('2026-08-25T16:00:00.000Z')
    const exactlyMidnight = new Date('2026-08-25T16:00:00.000Z')
    expect(nextLocalMidnight(exactlyMidnight, 8 * 60).toISOString()).toBe('2026-08-26T16:00:00.000Z')
  })

  it('reviews only the local day that just ended at midnight', () => {
    expect(completedLocalDayWindow(new Date('2026-08-25T16:00:00.000Z'), 8 * 60)).toEqual({
      afterCursor: Date.parse('2026-08-24T15:59:59.999Z'),
      throughCursor: Date.parse('2026-08-25T15:59:59.999Z'),
    })
  })
})
