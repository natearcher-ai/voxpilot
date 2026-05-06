// WebAssembly is available in Node.js but not included in ES2022 lib types
declare namespace WebAssembly {
  interface Module {}
  interface Instance {
    exports: Record<string, any>;
  }
  interface Memory {
    buffer: ArrayBuffer;
  }
  interface MemoryDescriptor {
    initial: number;
    maximum?: number;
  }
  interface ResultObject {
    module: Module;
    instance: Instance;
  }
  function instantiate(bufferSource: ArrayBuffer | Uint8Array, importObject?: Record<string, any>): Promise<ResultObject>;
  const Memory: {
    new(descriptor: MemoryDescriptor): Memory;
  };
}
