export class Education {
  constructor(
    public readonly institution: string,
    public readonly title: string,
    public readonly startDate: Date,
    public readonly endDate?: Date,
    public readonly id?: number,
  ) {}
}
