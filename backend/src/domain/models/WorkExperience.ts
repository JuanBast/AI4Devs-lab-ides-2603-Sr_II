export class WorkExperience {
  constructor(
    public readonly company: string,
    public readonly position: string,
    public readonly startDate: Date,
    public readonly description?: string,
    public readonly endDate?: Date,
    public readonly id?: number,
  ) {}
}
