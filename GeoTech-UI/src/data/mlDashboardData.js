export const mlDashboardData = {
    budget: {
      totalBudget: 2500000,
      totalSpent: 1875000,
      remaining: 625000,
      riskScore: 78,
      prediction: "High chance of budget overrun in next 30 days",
    },
  
    expenses: {
      totalBills: 86,
      salaryExpense: 620000,
      vendorExpense: 740000,
      machineryExpense: 515000,
      miscellaneousExpense: 95000,
    },
  
    employeeBills: [
      { name: "Rahul Sharma", bills: 18, amount: 180000 },
      { name: "Amit Kumar", bills: 14, amount: 145000 },
      { name: "Priya Singh", bills: 11, amount: 98000 },
    ],
  
    categoryBreakdown: [
      { category: "Vendor", amount: 740000 },
      { category: "Salary", amount: 620000 },
      { category: "Machinery", amount: 515000 },
      { category: "Miscellaneous", amount: 95000 },
    ],
  
    insights: [
      "Vendor payments are the highest spending category.",
      "Machinery cost increased compared to expected usage.",
      "12 employees generated bills this month.",
      "Budget usage crossed 75%, review required.",
    ],
  };