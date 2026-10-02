package com.example.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.example.data.model.BudgetItemEntity
import com.example.ui.components.AddBudgetItemDialog
import com.example.ui.theme.EmeraldPrimaryLight
import com.example.ui.viewmodel.BudgetUiState

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BudgetBreakdownScreen(
    state: BudgetUiState,
    onUpdateBudgetItemFrequency: (BudgetItemEntity, String, Double) -> Unit,
    onAddBudgetItem: (String, String, Double, String) -> Unit,
    onDeleteBudgetItem: (BudgetItemEntity) -> Unit,
    onIncludeDepositsChange: (Boolean) -> Unit,
    onIncludeTransfersChange: (Boolean) -> Unit
) {
    var showAddDialog by remember { mutableStateOf(false) }
    var itemToEdit by remember { mutableStateOf<BudgetItemEntity?>(null) }

    val totalWeekly = state.totalWeeklyExpenses.coerceAtLeast(1.0)
    val totalMonthly = state.budgetItems.sumOf { it.monthlyAmount }
    val totalYearly = state.budgetItems.sumOf { it.yearlyAmount }

    val grouped = state.budgetItems.groupBy { it.category }

    Scaffold(
        floatingActionButton = {
            ExtendedFloatingActionButton(
                onClick = { showAddDialog = true },
                icon = { Icon(Icons.Default.Add, contentDescription = "Add") },
                text = { Text("Line Item") }
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
            // Header summary
            item {
                Card(
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer),
                    shape = RoundedCornerShape(16.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Text(
                            text = "BUDGET BREAKDOWN (${state.currentPeriod?.name ?: "Current"})",
                            style = MaterialTheme.typography.labelMedium,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.onPrimaryContainer.copy(alpha = 0.8f)
                        )
                        Spacer(modifier = Modifier.height(8.dp))
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween
                        ) {
                            Column {
                                Text("Grand Total Weekly", style = MaterialTheme.typography.bodySmall)
                                Text("$%.2f".format(state.totalWeeklyExpenses), style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.ExtraBold)
                            }
                            Column {
                                Text("Monthly", style = MaterialTheme.typography.bodySmall)
                                Text("$%.2f".format(totalMonthly), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                            }
                            Column {
                                Text("Yearly", style = MaterialTheme.typography.bodySmall)
                                Text("$%.2f".format(totalYearly), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                            }
                        }
                    }
                }
            }

            // Which transaction types count toward actual budget figures
            item {
                val totals = state.actualTotals
                Card(
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                    shape = RoundedCornerShape(14.dp),
                    elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(modifier = Modifier.padding(14.dp)) {
                        Text(
                            text = "Budget Calculation Options",
                            style = MaterialTheme.typography.titleSmall,
                            fontWeight = FontWeight.Bold
                        )
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Column(modifier = Modifier.weight(1f)) {
                                Text("Include Deposits", style = MaterialTheme.typography.bodyMedium)
                                Text(
                                    "Count deposits toward actual budget totals",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
                            Switch(checked = state.includeDeposits, onCheckedChange = onIncludeDepositsChange)
                        }
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Column(modifier = Modifier.weight(1f)) {
                                Text("Include Transfers", style = MaterialTheme.typography.bodyMedium)
                                Text(
                                    "Transfers between your own accounts are not income or expenses, so they are excluded unless this is on",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
                            Switch(checked = state.includeTransfers, onCheckedChange = onIncludeTransfersChange)
                        }
                        HorizontalDivider(modifier = Modifier.padding(vertical = 8.dp))
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween
                        ) {
                            Text("Actual net flow this period", style = MaterialTheme.typography.bodySmall)
                            Text(
                                (if (totals.netFlow >= 0) "+$" else "-$") + "%.2f".format(kotlin.math.abs(totals.netFlow)),
                                style = MaterialTheme.typography.bodyMedium,
                                fontWeight = FontWeight.Bold
                            )
                        }
                    }
                }
            }

            // Categories
            grouped.forEach { (category, items) ->
                item {
                    val categoryWeeklyTotal = items.sumOf { it.weeklyAmount }
                    val catPct = (categoryWeeklyTotal / totalWeekly) * 100

                    Card(
                        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                        shape = RoundedCornerShape(14.dp),
                        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Column(modifier = Modifier.padding(14.dp)) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Text(
                                    text = category,
                                    style = MaterialTheme.typography.titleMedium,
                                    fontWeight = FontWeight.Bold,
                                    color = MaterialTheme.colorScheme.primary
                                )
                                Text(
                                    text = "$%.2f / wk (%.1f%%)".format(categoryWeeklyTotal, catPct),
                                    style = MaterialTheme.typography.labelMedium,
                                    fontWeight = FontWeight.SemiBold
                                )
                            }

                            HorizontalDivider(modifier = Modifier.padding(vertical = 8.dp))

                            items.forEach { item ->
                                val pct = (item.weeklyAmount / totalWeekly) * 100
                                Row(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .clickable { itemToEdit = item }
                                        .padding(vertical = 6.dp),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Column(modifier = Modifier.weight(1f)) {
                                        Text(
                                            text = item.subCategory,
                                            style = MaterialTheme.typography.bodyMedium,
                                            fontWeight = FontWeight.SemiBold
                                        )
                                        Text(
                                            text = "Mo: $%.2f • Yr: $%.2f • %.2f%%".format(item.monthlyAmount, item.yearlyAmount, pct),
                                            style = MaterialTheme.typography.bodySmall,
                                            color = MaterialTheme.colorScheme.onSurfaceVariant
                                        )
                                    }

                                    Row(verticalAlignment = Alignment.CenterVertically) {
                                        Text(
                                            text = "$%.2f/wk".format(item.weeklyAmount),
                                            fontWeight = FontWeight.Bold,
                                            style = MaterialTheme.typography.bodyMedium
                                        )
                                        IconButton(
                                            onClick = { onDeleteBudgetItem(item) },
                                            modifier = Modifier.size(32.dp)
                                        ) {
                                            Icon(
                                                Icons.Default.Close,
                                                contentDescription = "Delete",
                                                tint = MaterialTheme.colorScheme.error.copy(alpha = 0.6f),
                                                modifier = Modifier.size(16.dp)
                                            )
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    if (showAddDialog) {
        AddBudgetItemDialog(
            onDismiss = { showAddDialog = false },
            onConfirm = { cat, sub, amount, freq ->
                onAddBudgetItem(cat, sub, amount, freq)
                showAddDialog = false
            }
        )
    }

    itemToEdit?.let { item ->
        EditBudgetItemDialog(
            item = item,
            onDismiss = { itemToEdit = null },
            onSave = { field, value ->
                onUpdateBudgetItemFrequency(item, field, value)
                itemToEdit = null
            }
        )
    }
}

@Composable
fun EditBudgetItemDialog(
    item: BudgetItemEntity,
    onDismiss: () -> Unit,
    onSave: (field: String, value: Double) -> Unit
) {
    var field by remember { mutableStateOf("Weekly") }
    var valueText by remember {
        mutableStateOf(
            when (field) {
                "Monthly" -> "%.2f".format(item.monthlyAmount)
                "Yearly" -> "%.2f".format(item.yearlyAmount)
                else -> "%.2f".format(item.weeklyAmount)
            }
        )
    }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Edit ${item.category} - ${item.subCategory}") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text("Select which value to modify (the other two will auto-compute via 52-week formula):")
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    listOf("Weekly", "Monthly", "Yearly").forEach { f ->
                        FilterChip(
                            selected = field == f,
                            onClick = {
                                field = f
                                valueText = when (f) {
                                    "Monthly" -> "%.2f".format(item.monthlyAmount)
                                    "Yearly" -> "%.2f".format(item.yearlyAmount)
                                    else -> "%.2f".format(item.weeklyAmount)
                                }
                            },
                            label = { Text(f) }
                        )
                    }
                }
                OutlinedTextField(
                    value = valueText,
                    onValueChange = { valueText = it },
                    label = { Text("$field Amount ($)") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                    modifier = Modifier.fillMaxWidth()
                )
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    val amount = valueText.toDoubleOrNull() ?: 0.0
                    onSave(field, amount)
                }
            ) {
                Text("Update")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Cancel") }
        }
    )
}
