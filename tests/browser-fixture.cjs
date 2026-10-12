// Only the dev test runner injects these doubles. Production has no test switch.
module.exports = function fixture(options = {}) {
  window.fixture = { options, responses: [], prompts: [], executions: [], registrations: [], destroys: 0, creates: 0, tools: new Map() };
  const f = window.fixture;
  function session() { return {
    async clone() { return session(); },
    async prompt(input, settings) {
      f.prompts.push({ input: JSON.parse(typeof input === 'string' ? input : input[0].content), userMessage: Array.isArray(input) ? input.at(-1).content : null, constrained: !!settings.responseConstraint });
      const response = f.responses.shift() || { message: 'What needs your attention next?', tool: null };
      if (response.delay) { await new Promise(resolve => setTimeout(resolve, response.delay)); return JSON.stringify(response.envelope); }
      if (response.error) throw new Error(response.error);
      return typeof response === 'string' ? response : JSON.stringify(response);
    }, destroy() { f.destroys++; }
  }; }
  if (!options.missingModel) Object.defineProperty(window, 'LanguageModel', { configurable: true, value: {
    async availability() { return f.options.availability || 'available'; },
    async create(settings) {
      f.creates++;
      if (settings.monitor) { const monitor = new EventTarget(); settings.monitor(monitor); const event = new Event('downloadprogress'); event.loaded = .4; monitor.dispatchEvent(event); }
      if (f.options.createDelay) await new Promise(resolve => setTimeout(resolve, f.options.createDelay));
      if (f.options.createError) throw new Error('Fixture model download failed');
      return session();
    }
  } });
  if (!options.missingMcp) Object.defineProperty(document, 'modelContext', { configurable: true, value: {
    async registerTool(tool, settings) {
      if (f.options.registrationFailure === tool.name) throw new Error('Fixture registration failure');
      f.registrations.push(tool.name); f.tools.set(tool.name, tool);
      settings.signal.addEventListener('abort', () => f.tools.delete(tool.name), { once: true });
    },
    async getTools() { return [...f.tools.values()].map(tool => ({ name: tool.name, description: tool.description, inputSchema: f.options.legacyArguments ? JSON.stringify(tool.inputSchema) : tool.inputSchema, annotations: tool.annotations, origin: location.origin, window })); },
    async executeTool(descriptor, args, settings = {}) {
      if (f.options.legacyArguments) {
        if (typeof args !== 'string') throw new Error('Failed to parse input arguments');
        args = JSON.parse(args);
      }
      f.executions.push({ name: descriptor.name, args });
      if (f.options.executeError) throw new Error('Fixture native execution failure');
      const result = await f.tools.get(descriptor.name).execute(args, settings);
      if (f.options.afterCommitError) throw new Error('Fixture bridge lost committed result');
      if (f.options.malformedResult) return 'malformed native result';
      return result;
    }
  } });
};
