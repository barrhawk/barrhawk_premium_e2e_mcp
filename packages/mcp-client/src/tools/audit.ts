import { listTools, callTool, readResource } from '../index.js';

export interface AuditResult {
  score: number;
  checks: Array<{
    name: string;
    passed: boolean;
    details?: string;
  }>;
}

export async function mcp_audit_server(connectionId: string): Promise<AuditResult> {
  const checks: Array<{ name: string; passed: boolean; details?: string }> = [];
  
  // 1. Tool Listing Audit
  try {
    const list = await listTools(connectionId);
    checks.push({ name: 'list_tools_success', passed: true });
    
    // Check Schema Validity
    const invalidSchemas = list.tools.filter(t => !t.inputSchema || typeof t.inputSchema !== 'object');
    if (invalidSchemas.length > 0) {
      checks.push({ name: 'tool_schema_validity', passed: false, details: `Tools missing schema: ${invalidSchemas.map(t => t.name).join(', ')}` });
    } else {
      checks.push({ name: 'tool_schema_validity', passed: true });
    }

    // Check Descriptions
    const missingDocs = list.tools.filter(t => !t.description || t.description.length < 10);
    if (missingDocs.length > 0) {
      checks.push({ name: 'tool_descriptions', passed: false, details: `Poor descriptions for: ${missingDocs.map(t => t.name).join(', ')}` });
    } else {
      checks.push({ name: 'tool_descriptions', passed: true });
    }

  } catch (err: any) {
    checks.push({ name: 'list_tools_success', passed: false, details: err.message });
  }

  // 2. Error Handling Audit
  try {
    // Call a non-existent tool
    await callTool(connectionId, 'non_existent_tool_xyz_123', {});
    // Should throw or return error
    checks.push({ name: 'error_unknown_tool', passed: false, details: 'Server did not throw error for unknown tool' });
  } catch (err: any) {
    // This is good! We expect an error.
    // Ideally we check error code -32601 (Method not found)
    checks.push({ name: 'error_unknown_tool', passed: true, details: `Correctly threw: ${err.message}` });
  }

  // Calculate Score
  const passed = checks.filter(c => c.passed).length;
  const score = Math.round((passed / checks.length) * 100);

  return { score, checks };
}
