import { execa } from 'execa';

/**
 * Mobile Automation (Maestro Wrapper)
 */

export async function mobile_launch_app(appId: string): Promise<string> {
  const { stdout } = await execa('maestro', ['test', '--no-ansi', `
appId: ${appId}
---
- launchApp
`]);
  return stdout;
}

export async function mobile_tap_text(text: string): Promise<string> {
  const { stdout } = await execa('maestro', ['test', '--no-ansi', `
---
- tapOn: "${text}"
`]);
  return stdout;
}

export async function mobile_tap_id(id: string): Promise<string> {
  const { stdout } = await execa('maestro', ['test', '--no-ansi', `
---
- tapOn:
    id: "${id}"
`]);
  return stdout;
}

export async function mobile_input_text(text: string): Promise<string> {
  const { stdout } = await execa('maestro', ['test', '--no-ansi', `
---
- inputText: "${text}"
`]);
  return stdout;
}

export async function mobile_scroll(): Promise<string> {
  const { stdout } = await execa('maestro', ['test', '--no-ansi', `
---
- scroll
`]);
  return stdout;
}

export async function mobile_assert_visible(text: string): Promise<string> {
  const { stdout } = await execa('maestro', ['test', '--no-ansi', `
---
- assertVisible: "${text}"
`]);
  return stdout;
}
