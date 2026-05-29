'use strict';

const path = require('path');
const { execFileSync } = require('child_process');

const ENABLED = process.env.RUN_DOCKER_COMPOSE_HEALTHCHECK_TESTS === 'true';
const describeIf = ENABLED ? describe : describe.skip;
const projectRoot = path.resolve(__dirname, '..');

function dockerCompose(...args) {
  return execFileSync('docker', ['compose', '-f', 'docker-compose.yml', ...args], {
    cwd: projectRoot,
    encoding: 'utf8',
    stdio: 'pipe',
    timeout: 300_000,
  }).trim();
}

function inspectDocker(containerId, format) {
  return execFileSync('docker', ['inspect', `--format=${format}`, containerId], {
    cwd: projectRoot,
    encoding: 'utf8',
    stdio: 'pipe',
    timeout: 60_000,
  }).trim();
}

describeIf('Docker Compose backend healthcheck', () => {
  let backendContainerId;

  beforeAll(() => {
    dockerCompose('version');
    dockerCompose('up', '-d', '--build', '--wait', 'backend');
    backendContainerId = dockerCompose('ps', '-q', 'backend');
    if (!backendContainerId) {
      throw new Error('Backend container did not start successfully');
    }
  }, 360_000);

  afterAll(() => {
    try {
      dockerCompose('down', '--volumes');
    } catch (err) {
      // Cleanup best-effort; ignore failures during teardown.
    }
  }, 120_000);

  test('backend container is marked healthy by Docker healthcheck', () => {
    const healthStatus = inspectDocker(backendContainerId, '{{.State.Health.Status}}');
    expect(healthStatus).toBe('healthy');
  });

  test('backend /health endpoint is reachable from inside the container', () => {
    const output = execFileSync('docker', ['exec', backendContainerId, 'curl', '-f', 'http://localhost:5000/health'], {
      cwd: projectRoot,
      encoding: 'utf8',
      stdio: 'pipe',
      timeout: 60_000,
    }).trim();
    expect(output).toContain('"status":"healthy"');
  });
});
