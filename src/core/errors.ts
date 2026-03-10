export class ProjectContextMemoryError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ProjectContextMemoryError";
  }
}

export class ConfigurationError extends ProjectContextMemoryError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ConfigurationError";
  }
}

export class DatabaseSetupError extends ProjectContextMemoryError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "DatabaseSetupError";
  }
}
