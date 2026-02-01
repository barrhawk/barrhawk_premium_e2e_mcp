import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function snapshotContainer(containerId: string, snapshotName: string): Promise<string> {
  // Commit the container state to a new image
  const { stdout } = await execAsync(`docker commit ${containerId} ${snapshotName}`);
  return stdout.trim();
}

export async function restoreContainer(containerId: string, snapshotName: string): Promise<void> {
  // Stop current
  await execAsync(`docker stop ${containerId}`);
  await execAsync(`docker rm ${containerId}`);
  // Start new from snapshot (this is simplified, would need to preserve ports/env)
  await execAsync(`docker run -d --name ${containerId} ${snapshotName}`);
}

export async function pgDump(containerId: string, dbUser: string, dbName: string, outputFile: string): Promise<void> {
  await execAsync(`docker exec ${containerId} pg_dump -U ${dbUser} ${dbName} > ${outputFile}`);
}

export async function pgRestore(containerId: string, dbUser: string, dbName: string, dumpFile: string): Promise<void> {
  await execAsync(`cat ${dumpFile} | docker exec -i ${containerId} psql -U ${dbUser} ${dbName}`);
}
