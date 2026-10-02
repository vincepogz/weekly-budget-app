package com.example.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.example.data.model.*
import com.example.ui.components.ContributorDialog
import com.example.ui.theme.ExpenseRed
import com.example.ui.theme.IncomeGreen
import com.example.ui.viewmodel.BudgetUiState

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ContributorsCashFlowScreen(
    state: BudgetUiState,
    onSaveContributor: (
        name: String,
        incomes: List<Double>,
        allowance: Double,
        note: String,
        contributions: List<Pair<String, Double>>,
        existingId: String?
    ) -> Unit,
    onDeleteContributor: (ContributorEntity) -> Unit
) {
    var showAddContribDialog by remember { mutableStateOf(false) }
    var editingContributor by remember { mutableStateOf<ContributorEntity?>(null) }

    Scaffold(
        floatingActionButton = {
            ExtendedFloatingActionButton(
                onClick = {
                    editingContributor = null
                    showAddContribDialog = true
                },
                icon = { Icon(Icons.Default.Add, contentDescription = "Add Contributor") },
                text = { Text("Add Contributor") }
            )
        }
    ) { padding ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(horizontal = 16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
            contentPadding = PaddingValues(top = 16.dp, bottom = 96.dp)
        ) {
            // 1. Relocated Weekly Cash Flow Hero Card
            item {
                Card(
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer),
                    shape = RoundedCornerShape(20.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(modifier = Modifier.padding(20.dp)) {
                        Text(
                            text = "WEEKLY CASH FLOW",
                            style = MaterialTheme.typography.labelMedium,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.onPrimaryContainer.copy(alpha = 0.7f)
                        )
                        Spacer(modifier = Modifier.height(6.dp))

                        val net = state.weeklyNetCashFlow
                        val isPositive = net >= 0
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.SpaceBetween,
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Text(
                                text = (if (isPositive) "+" else "") + "$%.2f".format(net),
                                style = MaterialTheme.typography.headlineLarge,
                                fontWeight = FontWeight.ExtraBold,
                                color = if (isPositive) IncomeGreen else ExpenseRed
                            )
                            Surface(
                                shape = RoundedCornerShape(12.dp),
                                color = MaterialTheme.colorScheme.surface.copy(alpha = 0.85f),
                                modifier = Modifier.padding(4.dp)
                            ) {
                                Text(
                                    text = if (isPositive) "SURPLUS" else "DEFICIT",
                                    style = MaterialTheme.typography.labelSmall,
                                    fontWeight = FontWeight.Bold,
                                    color = if (isPositive) IncomeGreen else ExpenseRed,
                                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                                )
                            }
                        }

                        Spacer(modifier = Modifier.height(16.dp))
                        HorizontalDivider(color = MaterialTheme.colorScheme.onPrimaryContainer.copy(alpha = 0.15f))
                        Spacer(modifier = Modifier.height(16.dp))

                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween
                        ) {
                            Column {
                                Text(
                                    text = "Weekly Inflow",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onPrimaryContainer.copy(alpha = 0.8f)
                                )
                                Text(
                                    text = "$%.2f".format(state.totalWeeklyIncome),
                                    style = MaterialTheme.typography.titleMedium,
                                    fontWeight = FontWeight.SemiBold,
                                    color = MaterialTheme.colorScheme.onPrimaryContainer
                                )
                            }

                            Column(horizontalAlignment = Alignment.End) {
                                Text(
                                    text = "Weekly Budget Expense",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onPrimaryContainer.copy(alpha = 0.8f)
                                )
                                Text(
                                    text = "$%.2f".format(state.totalWeeklyExpenses),
                                    style = MaterialTheme.typography.titleMedium,
                                    fontWeight = FontWeight.SemiBold,
                                    color = MaterialTheme.colorScheme.onPrimaryContainer
                                )
                            }
                        }

                        Spacer(modifier = Modifier.height(12.dp))

                        // Period Multiplier Summary
                        Card(
                            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                            shape = RoundedCornerShape(12.dp),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(12.dp),
                                horizontalArrangement = Arrangement.SpaceBetween
                            ) {
                                Column {
                                    Text("${state.numberOfWeeks}-Week Total Expense", style = MaterialTheme.typography.bodySmall)
                                    Text("$%.2f".format(state.periodTotalExpense), fontWeight = FontWeight.Bold)
                                }
                                Column(horizontalAlignment = Alignment.End) {
                                    Text("${state.numberOfWeeks}-Week Net Balance", style = MaterialTheme.typography.bodySmall)
                                    Text(
                                        "$%.2f".format(state.periodGrandTotalBalance),
                                        fontWeight = FontWeight.Bold,
                                        color = if (state.periodGrandTotalBalance >= 0) IncomeGreen else ExpenseRed
                                    )
                                }
                            }
                        }
                    }
                }
            }

            // 2. Combined Inflow vs Weekly Expense Total Overview Card
            item {
                Card(
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
                    shape = RoundedCornerShape(16.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween
                        ) {
                            Column(modifier = Modifier.weight(1f)) {
                                Text(
                                    text = "TOTAL COMBINED INFLOW",
                                    style = MaterialTheme.typography.labelSmall,
                                    fontWeight = FontWeight.Bold,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.8f)
                                )
                                Spacer(modifier = Modifier.height(4.dp))
                                Text(
                                    text = "$%.2f / wk".format(state.totalWeeklyIncome),
                                    style = MaterialTheme.typography.titleLarge,
                                    fontWeight = FontWeight.ExtraBold,
                                    color = IncomeGreen
                                )
                                Spacer(modifier = Modifier.height(4.dp))
                                Text(
                                    text = "${state.numberOfWeeks}-Wk: $%.2f".format(state.totalWeeklyIncome * state.numberOfWeeks),
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.9f)
                                )
                            }

                            Spacer(modifier = Modifier.width(16.dp))

                            Column(modifier = Modifier.weight(1f), horizontalAlignment = Alignment.End) {
                                Text(
                                    text = "WEEKLY EXPENSE TOTAL",
                                    style = MaterialTheme.typography.labelSmall,
                                    fontWeight = FontWeight.Bold,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.8f)
                                )
                                Spacer(modifier = Modifier.height(4.dp))
                                Text(
                                    text = "$%.2f / wk".format(state.totalWeeklyExpenses),
                                    style = MaterialTheme.typography.titleLarge,
                                    fontWeight = FontWeight.ExtraBold,
                                    color = ExpenseRed
                                )
                                Spacer(modifier = Modifier.height(4.dp))
                                Text(
                                    text = "${state.numberOfWeeks}-Wk: $%.2f".format(state.periodTotalExpense),
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.9f)
                                )
                            }
                        }
                    }
                }
            }

            // Section Header
            item {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = "Contributors & Cash Flow Allocations",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold
                    )
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            text = "${state.contributors.size} Contributors",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        Spacer(modifier = Modifier.width(4.dp))
                        IconButton(onClick = {
                            editingContributor = null
                            showAddContribDialog = true
                        }) {
                            Icon(Icons.Default.AddCircleOutline, contentDescription = "Add Contributor", tint = MaterialTheme.colorScheme.primary)
                        }
                    }
                }
            }

            // Empty State
            if (state.contributors.isEmpty()) {
                item {
                    Card(
                        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                        shape = RoundedCornerShape(14.dp),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Column(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(24.dp),
                            horizontalAlignment = Alignment.CenterHorizontally
                        ) {
                            Icon(Icons.Default.PeopleOutline, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(40.dp))
                            Spacer(modifier = Modifier.height(8.dp))
                            Text("No Contributors Added Yet", fontWeight = FontWeight.Bold)
                            Spacer(modifier = Modifier.height(4.dp))
                            Text(
                                text = "Add contributors to set up incomes, contributions to accounts and sinking funds, and automatically compute weekly allowances.",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                            Spacer(modifier = Modifier.height(14.dp))
                            Button(
                                onClick = {
                                    editingContributor = null
                                    showAddContribDialog = true
                                }
                            ) {
                                Icon(Icons.Default.Add, contentDescription = null)
                                Spacer(modifier = Modifier.width(6.dp))
                                Text("Add Contributor")
                            }
                        }
                    }
                }
            }

            // 3. Contributor Cards
            items(state.contributors) { c ->
                Card(
                    onClick = { editingContributor = c },
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                    shape = RoundedCornerShape(14.dp),
                    elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(4.dp)
                            ) {
                                Text(
                                    text = c.name,
                                    style = MaterialTheme.typography.titleMedium,
                                    fontWeight = FontWeight.Bold,
                                    color = MaterialTheme.colorScheme.primary
                                )
                                IconButton(
                                    onClick = { editingContributor = c },
                                    modifier = Modifier.size(28.dp)
                                ) {
                                    Icon(
                                        Icons.Default.Edit,
                                        contentDescription = "Edit ${c.name}",
                                        tint = MaterialTheme.colorScheme.primary.copy(alpha = 0.7f),
                                        modifier = Modifier.size(16.dp)
                                    )
                                }
                                IconButton(
                                    onClick = { onDeleteContributor(c) },
                                    modifier = Modifier.size(28.dp)
                                ) {
                                    Icon(
                                        Icons.Default.Delete,
                                        contentDescription = "Delete ${c.name}",
                                        tint = MaterialTheme.colorScheme.error.copy(alpha = 0.7f),
                                        modifier = Modifier.size(16.dp)
                                    )
                                }
                            }

                            Text(
                                text = "Total: $%.2f / wk".format(c.totalIncome),
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.Bold,
                                color = IncomeGreen
                            )
                        }

                        if (c.note.isNotBlank()) {
                            Spacer(modifier = Modifier.height(6.dp))
                            Surface(
                                shape = RoundedCornerShape(8.dp),
                                color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f),
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                Text(
                                    text = "Note: ${c.note}",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp)
                                )
                            }
                        }

                        HorizontalDivider(modifier = Modifier.padding(vertical = 10.dp))

                        // Incomes Breakdown
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween
                        ) {
                            Column {
                                Text("Income #1", style = MaterialTheme.typography.bodySmall)
                                Text("$%.2f".format(c.income1), fontWeight = FontWeight.SemiBold)
                            }
                            if (c.income2 > 0) {
                                Column {
                                    Text("Income #2", style = MaterialTheme.typography.bodySmall)
                                    Text("$%.2f".format(c.income2), fontWeight = FontWeight.SemiBold)
                                }
                            }
                            if (c.income3 > 0) {
                                Column {
                                    Text("Income #3", style = MaterialTheme.typography.bodySmall)
                                    Text("$%.2f".format(c.income3), fontWeight = FontWeight.SemiBold)
                                }
                            }
                            Column(horizontalAlignment = Alignment.End) {
                                Text("Weekly Allowance", style = MaterialTheme.typography.bodySmall)
                                Text(
                                    text = "$%.2f".format(c.weeklyAllowance),
                                    fontWeight = FontWeight.Bold,
                                    color = MaterialTheme.colorScheme.tertiary
                                )
                            }
                        }

                        // Contributions to Accounts / Goals
                        val contribAllocs = state.allocations.filter { it.contributorId == c.id }
                        if (contribAllocs.isNotEmpty()) {
                            Spacer(modifier = Modifier.height(10.dp))
                            Text(
                                text = "Shared Contributions to Accounts / Goals:",
                                style = MaterialTheme.typography.labelSmall,
                                fontWeight = FontWeight.Bold,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                            Spacer(modifier = Modifier.height(4.dp))
                            contribAllocs.forEach { alloc ->
                                val accName = state.accounts.find { it.id == alloc.accountId }?.name ?: alloc.accountId
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween
                                ) {
                                    Text(
                                        text = "• $accName",
                                        style = MaterialTheme.typography.bodySmall
                                    )
                                    Text(
                                        text = "$%.2f (%.0f%%)".format(alloc.amount, alloc.percentage),
                                        style = MaterialTheme.typography.bodySmall,
                                        fontWeight = FontWeight.Medium
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    if (showAddContribDialog || editingContributor != null) {
        ContributorDialog(
            existing = editingContributor,
            existingAllocations = state.allocations.filter { it.contributorId == editingContributor?.id },
            accounts = state.accounts,
            onDismiss = {
                showAddContribDialog = false
                editingContributor = null
            },
            onSave = { name, incomes, allowance, note, contributions ->
                onSaveContributor(name, incomes, allowance, note, contributions, editingContributor?.id)
                showAddContribDialog = false
                editingContributor = null
            },
            onDelete = editingContributor?.let { contrib ->
                {
                    onDeleteContributor(contrib)
                    showAddContribDialog = false
                    editingContributor = null
                }
            }
        )
    }
}
