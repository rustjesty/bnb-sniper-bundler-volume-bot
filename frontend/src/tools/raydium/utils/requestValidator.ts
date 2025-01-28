interface ValidatorOptions {
  apiKey: string;
}

export class RequestValidator {
  private options: ValidatorOptions;

  constructor(options: ValidatorOptions) {
    this.options = options;
  }

  isValidApiKey(apiKey: string): boolean {
    return apiKey === this.options.apiKey;
  }
}
