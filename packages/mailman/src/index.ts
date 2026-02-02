import { SMTPServer } from 'smtp-server';
import { simpleParser } from 'mailparser';

/**
 * THE MAILMAN - Local Email Sink
 */

interface StoredEmail {
  id: string;
  to: string;
  from: string;
  subject: string;
  text: string;
  html: string;
  receivedAt: Date;
}

const inbox: StoredEmail[] = [];
let server: SMTPServer | null = null;

export async function mailman_start(port: number = 1025): Promise<{ success: boolean; port: number }> {
  return new Promise((resolve, reject) => {
    server = new SMTPServer({
      authOptional: true,
      onData(stream, session, callback) {
        simpleParser(stream, (err, parsed) => {
          if (err) return callback(err);
          
          inbox.push({
            id: `email_${Date.now()}_${Math.random().toString(36).slice(2)}`,
            to: parsed.to?.text || 'unknown',
            from: parsed.from?.text || 'unknown',
            subject: parsed.subject || 'No Subject',
            text: parsed.text || '',
            html: parsed.html || '',
            receivedAt: new Date(),
          });
          callback();
        });
      },
    });

    server.listen(port, () => {
      resolve({ success: true, port });
    });
    
    server.on('error', (err) => {
      // Ignore if address in use (likely already running)
      if ((err as any).code === 'EADDRINUSE') resolve({ success: true, port });
      else reject(err);
    });
  });
}

export async function mailman_check(filter: { to?: string; subject?: string }): Promise<StoredEmail[]> {
  return inbox.filter(email => {
    if (filter.to && !email.to.includes(filter.to)) return false;
    if (filter.subject && !email.subject.includes(filter.subject)) return false;
    return true;
  });
}

export async function mailman_clear(): Promise<boolean> {
  inbox.length = 0;
  return true;
}
