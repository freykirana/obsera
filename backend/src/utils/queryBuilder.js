/**
 * Helper to build the Prisma 'where' object based on query parameters
 * This is shared between the raw logs fetching and the stats aggregation
 * to ensure filters apply perfectly to both endpoints.
 */
const buildWhereClause = (query) => {
  const { search, status, riskLevel, startDate, endDate } = query;
  const where = {};

  if (status) {
    const statusArray = status.split(",").map(s => s.trim());
    where.status = { in: statusArray };
  }



  if (startDate || endDate) {
    where.access_time = {};
    if (startDate) where.access_time.gte = new Date(startDate);
    if (endDate) where.access_time.lte = new Date(endDate);
  }

  if (search) {
    const searchCondition = [
      { attacker: { source_ip: { contains: search } } },
      { username_attempt: { contains: search, mode: "insensitive" } },
    ];
    
    if (where.OR) {
      where.AND = [
        { OR: where.OR },
        { OR: searchCondition }
      ];
      delete where.OR;
    } else {
      where.OR = searchCondition;
    }
  }

  return where;
};

module.exports = {
  buildWhereClause
};
