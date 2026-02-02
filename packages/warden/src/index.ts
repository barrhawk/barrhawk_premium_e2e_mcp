import { execa } from 'execa';

/**
 * THE WARDEN - Infrastructure Verification
 */

export async function check_k8s_resource(
  kind: string, 
  name: string, 
  namespace: string = 'default'
): Promise<{ exists: boolean; status: string }> {
  try {
    const { stdout } = await execa('kubectl', ['get', kind, name, '-n', namespace, '-o', 'json']);
    const data = JSON.parse(stdout);
    return { exists: true, status: data.status?.phase || 'Unknown' };
  } catch (e) {
    return { exists: false, status: 'Missing' };
  }
}

export async function check_aws_s3_public(bucket: string): Promise<{ isPublic: boolean }> {
  try {
    const { stdout } = await execa('aws', ['s3api', 'get-bucket-policy-status', '--bucket', bucket]);
    const data = JSON.parse(stdout);
    return { isPublic: data.PolicyStatus?.IsPublic || false };
  } catch (e: any) {
    if (e.message.includes('NoSuchBucketPolicy')) return { isPublic: false }; // Private by default
    throw e;
  }
}
