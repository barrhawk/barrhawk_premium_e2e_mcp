/**
 * Chaos Monkey - UI Fuzzer
 */

export const CHAOS_SCRIPT = `
(function() {
  const DURATION = __DURATION__;
  const SEED = __SEED__;
  const start = Date.now();
  
  function random(max) {
    return Math.floor(Math.random() * max);
  }

  const actions = [
    () => { // Click random element
      const clickables = document.querySelectorAll('button, a, input, [role="button"]');
      if (clickables.length > 0) clickables[random(clickables.length)].click();
    },
    () => { // Scroll randomly
      window.scrollTo(random(document.body.scrollWidth), random(document.body.scrollHeight));
    },
    () => { // Input garbage
      const inputs = document.querySelectorAll('input, textarea');
      if (inputs.length > 0) {
        const el = inputs[random(inputs.length)];
        el.value = "" + Math.random().toString(36);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
  ];

  const interval = setInterval(() => {
    if (Date.now() - start > DURATION) {
      clearInterval(interval);
      console.log("Chaos run complete");
      return;
    }
    
    try {
      const action = actions[random(actions.length)];
      action();
    } catch (e) {
      console.error("Chaos caused error:", e);
    }
  }, 50);
})();
`;
