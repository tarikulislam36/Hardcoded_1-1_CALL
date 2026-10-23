import { expect, test } from '@playwright/test'

async function prepare(page) {
  await page.goto('/')
  await expect(page.getByTestId('socket-status')).toHaveText('connected')
  await page.getByRole('button', { name: 'Start camera', exact: true }).click()
  await expect(
    page.getByRole('button', { name: 'Join room', exact: true })
  ).toBeEnabled()
}

async function join(page) {
  await page.getByRole('button', { name: 'Join room', exact: true }).click()
  await expect(page.getByTestId('role')).not.toHaveText('not joined')
}

async function assertMedia(page) {
  try {
    await expect(page.getByTestId('pc-state')).toHaveText('connected', {
      timeout: 12_000
    })
  } catch (error) {
    console.log('Call diagnostics:', await page.locator('main').innerText())
    throw error
  }
  await expect
    .poll(
      () =>
        page.evaluate(async () => {
          const snapshot = await window.__rtcDemo.snapshot()
          return (
            snapshot.inbound.some(
              (entry) => entry.kind === 'video' && entry.framesDecoded > 3
            ) &&
            snapshot.inbound.some(
              (entry) => entry.kind === 'audio' && entry.bytesReceived > 0
            )
          )
        }),
      { timeout: 15_000 }
    )
    .toBe(true)
  await expect
    .poll(() =>
      page.getByTestId('remote-video').evaluate((video) => video.videoWidth)
    )
    .toBeGreaterThan(0)
}

test('real browser WebRTC: media both ways, mute, camera, hang up, call again, room limit and replacement', async ({
  context
}) => {
  const a = await context.newPage(),
    b = await context.newPage(),
    c = await context.newPage()
  const errors = []
  for (const page of [a, b, c])
    page.on('pageerror', (error) => errors.push(error.message))
  await prepare(a)
  await join(a)
  await prepare(b)
  await join(b)
  await expect(a.getByTestId('role')).toHaveText('caller')
  await expect(b.getByTestId('role')).toHaveText('callee')
  await a.getByRole('button', { name: 'Start call', exact: true }).click()
  await Promise.all([assertMedia(a), assertMedia(b)])

  await a.getByRole('button', { name: 'Mute microphone', exact: true }).click()
  expect(
    (await a.evaluate(() => window.__rtcDemo.snapshot())).localTracks.find(
      (t) => t.kind === 'audio'
    ).enabled
  ).toBe(false)
  await a
    .getByRole('button', { name: 'Unmute microphone', exact: true })
    .click()
  await a.getByRole('button', { name: 'Turn camera off', exact: true }).click()
  expect(
    (await a.evaluate(() => window.__rtcDemo.snapshot())).localTracks.find(
      (t) => t.kind === 'video'
    ).enabled
  ).toBe(false)
  await a.getByRole('button', { name: 'Turn camera on', exact: true }).click()

  await prepare(c)
  await c.getByRole('button', { name: 'Join room', exact: true }).click()
  await expect(c.getByRole('alert')).toContainText('room is full')
  for (let round = 0; round < 2; round += 1) {
    await a.getByRole('button', { name: 'Hang up', exact: true }).click()
    await expect(b.getByTestId('pc-state')).toHaveText('not created')
    await expect(
      a.getByRole('button', { name: 'Start call', exact: true })
    ).toBeEnabled()
    await a.getByRole('button', { name: 'Start call', exact: true }).click()
    await Promise.all([assertMedia(a), assertMedia(b)])
  }

  await a.evaluate(() => {
    window.previousCapture = document.querySelector(
      '[data-testid="local-video"]'
    ).srcObject
  })
  await a
    .getByRole('button', { name: 'Leave / stop camera', exact: true })
    .click()
  expect(
    await a.evaluate(() =>
      window.previousCapture
        .getTracks()
        .every((track) => track.readyState === 'ended')
    )
  ).toBe(true)
  await expect(b.getByTestId('role')).toHaveText('caller')
  await join(c)
  await b.getByRole('button', { name: 'Start call', exact: true }).click()
  await Promise.all([assertMedia(b), assertMedia(c)])
  await c.reload()
  await expect(b.getByTestId('pc-state')).toHaveText('not created')
  await prepare(c)
  await join(c)
  await b.getByRole('button', { name: 'Start call', exact: true }).click()
  await Promise.all([assertMedia(b), assertMedia(c)])
  expect(errors).toEqual([])
})

test('permission denial is shown clearly without joining the room', async ({
  page
}) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      throw new DOMException('Denied for this test', 'NotAllowedError')
    }
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'Start camera', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('permission was denied')
  await expect(
    page.getByRole('button', { name: 'Join room', exact: true })
  ).toBeDisabled()
})

test('leaving while permission is pending releases a late capture stream', async ({
  page
}) => {
  await page.addInitScript(() => {
    const original = navigator.mediaDevices.getUserMedia.bind(
      navigator.mediaDevices
    )
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      const stream = await original(constraints)
      window.lateCapture = stream
      await new Promise((resolve) => {
        window.releasePermission = resolve
      })
      return stream
    }
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'Start camera', exact: true }).click()
  await page.waitForFunction(() => Boolean(window.releasePermission))
  await page
    .getByRole('button', { name: 'Leave / stop camera', exact: true })
    .click()
  await page.evaluate(() => window.releasePermission())
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.lateCapture
          .getTracks()
          .every((track) => track.readyState === 'ended')
      )
    )
    .toBe(true)
  await expect(
    page.getByRole('button', { name: 'Join room', exact: true })
  ).toBeDisabled()
})
