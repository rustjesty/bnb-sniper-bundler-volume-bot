// src/lib/browserAdapter.ts
export const readFileSync = (path: string) => {
    throw new Error('File system operations are not supported in the browser');
  };
  
  export const writeFileSync = (path: string, data: any) => {
    throw new Error('File system operations are not supported in the browser');
  };
  
  export const exists = (path: string) => {
    return false;
  };
  
  export const mkdir = (path: string) => {
    throw new Error('File system operations are not supported in the browser');
  };