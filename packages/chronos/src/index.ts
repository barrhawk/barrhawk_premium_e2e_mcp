/**
 * CHRONOS - Time Manipulation
 * (Browser-side script injection)
 */

export function getTimetravelScript(isoDate: string): string {
  const timestamp = new Date(isoDate).getTime();
  
  return `
    (function() {
      const targetTime = ${timestamp};
      const now = Date.now();
      const diff = targetTime - now;

      // Override Date constructor
      const OriginalDate = Date;
      
      // Mock Date
      globalThis.Date = class extends OriginalDate {
        constructor(...args) {
          if (args.length === 0) {
            super(OriginalDate.now() + diff);
          } else {
            super(...args);
          }
        }
        
        static now() {
          return OriginalDate.now() + diff;
        }
      };
      
      console.log('🕒 Chronos: Time traveled to ' + new Date());
    })();
  `;
}
