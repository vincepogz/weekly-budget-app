package com.example.ui.components

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.example.data.model.AccountEntity
import com.example.data.domain.TransactionDraft
import com.example.data.domain.TransactionValidator
import com.example.data.model.*
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/**
 * Create (existing == null) or edit a transaction. The visible fields depend on the type:
 *  - Deposit:    Account, Amount, Date, Description, Cleared
 *  - Withdrawal: Account, Amount, Date, Category (dropdown), Sub Category (dropdown), Description, Cleared
 *  - Transfer:   From Account, To Account, Amount, Date, Description, Cleared
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TransactionDialog(
    accounts: List<AccountEntity>,
    existing: TransactionEntity? = null,
    initialAccountId: String? = null,
    budgetItems: List<BudgetItemEntity> = emptyList(),
    existingTransactions: List<TransactionEntity> = emptyList(),
    onDismiss: () -> Unit,
    onSave: (TransactionDraft) -> Unit
) {
    var type by remember { mutableStateOf(existing?.transactionType ?: TransactionType.WITHDRAWAL) }
    var amountText by remember {
        mutableStateOf(existing?.let { String.format(Locale.US, "%.2f", it.amount) } ?: "")
    }
    var date by remember {
        mutableStateOf(
            existing?.date?.takeIf { it.isNotBlank() }
                ?: SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date())
        )
    }
    var accountId by remember {
        mutableStateOf(
            existing?.accountId
                ?: initialAccountId?.takeIf { id -> accounts.any { it.id == id } }
                ?: accounts.firstOrNull()?.id
                ?: ""
        )
    }
    var toAccountId by remember {
        mutableStateOf(
            existing?.toAccountId
                ?: accounts.firstOrNull { it.id != accountId }?.id
                ?: ""
        )
    }
    var category by remember { mutableStateOf(existing?.category ?: "") }
    var isCustomCategory by remember { mutableStateOf(false) }
    var subCategory by remember { mutableStateOf(existing?.subCategory ?: "") }
    var isCustomSubCategory by remember { mutableStateOf(false) }
    var note by remember { mutableStateOf(existing?.note ?: "") }
    var cleared by remember { mutableStateOf(existing?.cleared ?: true) }
    var error by remember { mutableStateOf<String?>(null) }
    var showDatePicker by remember { mutableStateOf(false) }

    val utcFormat = remember {
        SimpleDateFormat("yyyy-MM-dd", Locale.US).apply {
            timeZone = TimeZone.getTimeZone("UTC")
        }
    }
    val initialPickerMillis = remember(date) {
        try {
            utcFormat.parse(date)?.time
        } catch (e: Exception) {
            null
        } ?: System.currentTimeMillis()
    }
    val datePickerState = rememberDatePickerState(initialSelectedDateMillis = initialPickerMillis)

    val knownCategories = remember(budgetItems, existingTransactions, existing) {
        val list = mutableListOf<String>()
        budgetItems.map { it.category.trim().uppercase() }.filter { it.isNotBlank() }.distinct().forEach { list.add(it) }
        existingTransactions.map { it.category.trim().uppercase() }.filter { it.isNotBlank() }.distinct().forEach {
            if (!list.contains(it)) list.add(it)
        }
        existing?.category?.trim()?.uppercase()?.takeIf { it.isNotBlank() }?.let {
            if (!list.contains(it)) list.add(it)
        }
        list.sorted()
    }

    val knownSubCategories = remember(category, budgetItems, existingTransactions, existing) {
        val list = mutableListOf<String>()
        budgetItems.filter { it.category.equals(category, ignoreCase = true) }
            .map { it.subCategory.trim().uppercase() }.filter { it.isNotBlank() }.distinct().forEach { list.add(it) }
        existingTransactions.filter { it.category.equals(category, ignoreCase = true) }
            .map { it.subCategory.trim().uppercase() }.filter { it.isNotBlank() }.distinct().forEach {
                if (!list.contains(it)) list.add(it)
            }
        if (existing?.category.equals(category, ignoreCase = true)) {
            existing?.subCategory?.trim()?.uppercase()?.takeIf { it.isNotBlank() }?.let {
                if (!list.contains(it)) list.add(it)
            }
        }
        list.sorted()
    }

    val isTransfer = type == TransactionType.TRANSFER

    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Text(if (existing == null) "Add Transaction" else "Edit Transaction", fontWeight = FontWeight.Bold)
        },
        text = {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                // Transaction Type
                Text("Transaction Type", style = MaterialTheme.typography.labelMedium)
                Column(modifier = Modifier.selectableGroup()) {
                    TransactionType.values().forEach { option ->
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .selectable(
                                    selected = type == option,
                                    onClick = {
                                        type = option
                                        error = null
                                    },
                                    role = Role.RadioButton
                                )
                                .padding(vertical = 2.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            RadioButton(selected = type == option, onClick = null)
                            Spacer(modifier = Modifier.width(8.dp))
                            Text(option.label)
                        }
                    }
                }

                // Account(s)
                AccountPicker(
                    label = if (isTransfer) "From Account" else "Account",
                    accounts = accounts,
                    selectedId = accountId,
                    onSelected = { picked ->
                        accountId = picked
                        if (toAccountId == picked) {
                            toAccountId = accounts.firstOrNull { it.id != picked }?.id ?: ""
                        }
                        error = null
                    }
                )
                if (isTransfer) {
                    AccountPicker(
                        label = "To Account",
                        accounts = accounts.filter { it.id != accountId },
                        selectedId = toAccountId,
                        onSelected = {
                            toAccountId = it
                            error = null
                        }
                    )
                }

                OutlinedTextField(
                    value = amountText,
                    onValueChange = { amountText = it },
                    label = { Text("Amount ($)") },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                    modifier = Modifier.fillMaxWidth()
                )

                // Date Picker (Material 3 Calendar Dialog)
                Column {
                    Text("Date", style = MaterialTheme.typography.labelMedium)
                    OutlinedButton(
                        onClick = { showDatePicker = true },
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Text(date.ifBlank { "Select Date" }, modifier = Modifier.weight(1f))
                        Icon(Icons.Default.CalendarToday, contentDescription = "Choose Date")
                    }
                }

                if (type == TransactionType.WITHDRAWAL) {
                    // Category Dropdown / Custom
                    if (isCustomCategory) {
                        OutlinedTextField(
                            value = category,
                            onValueChange = { category = it.uppercase() },
                            label = { Text("Custom Category") },
                            singleLine = true,
                            trailingIcon = {
                                IconButton(onClick = {
                                    isCustomCategory = false
                                    category = knownCategories.firstOrNull() ?: ""
                                }) {
                                    Icon(Icons.Default.Clear, contentDescription = "Use List")
                                }
                            },
                            modifier = Modifier.fillMaxWidth()
                        )
                    } else {
                        DropdownPicker(
                            label = "Category",
                            selectedValue = category,
                            options = knownCategories,
                            placeholder = "Select Category",
                            onSelected = {
                                category = it
                                subCategory = ""
                                isCustomSubCategory = false
                            },
                            onAddNew = {
                                isCustomCategory = true
                                category = ""
                            }
                        )
                    }

                    // Sub Category Dropdown / Custom
                    if (isCustomSubCategory) {
                        OutlinedTextField(
                            value = subCategory,
                            onValueChange = { subCategory = it.uppercase() },
                            label = { Text("Custom Sub Category") },
                            singleLine = true,
                            trailingIcon = {
                                IconButton(onClick = {
                                    isCustomSubCategory = false
                                    subCategory = knownSubCategories.firstOrNull() ?: ""
                                }) {
                                    Icon(Icons.Default.Clear, contentDescription = "Use List")
                                }
                            },
                            modifier = Modifier.fillMaxWidth()
                        )
                    } else {
                        DropdownPicker(
                            label = "Sub Category",
                            selectedValue = subCategory,
                            options = knownSubCategories,
                            placeholder = if (category.isBlank()) "Select Category first" else "Select Sub Category",
                            onSelected = { subCategory = it },
                            onAddNew = {
                                isCustomSubCategory = true
                                subCategory = ""
                            }
                        )
                    }
                }

                OutlinedTextField(
                    value = note,
                    onValueChange = { note = it },
                    label = { Text("Description") },
                    modifier = Modifier.fillMaxWidth()
                )

                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable { cleared = !cleared },
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Checkbox(checked = cleared, onCheckedChange = null)
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("Cleared")
                }

                error?.let {
                    Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                }
            }

            if (showDatePicker) {
                DatePickerDialog(
                    onDismissRequest = { showDatePicker = false },
                    confirmButton = {
                        TextButton(onClick = {
                            datePickerState.selectedDateMillis?.let { millis ->
                                date = utcFormat.format(Date(millis))
                            }
                            showDatePicker = false
                        }) {
                            Text("OK")
                        }
                    },
                    dismissButton = {
                        TextButton(onClick = { showDatePicker = false }) {
                            Text("Cancel")
                        }
                    }
                ) {
                    DatePicker(state = datePickerState)
                }
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    val cleanedAmount = amountText.trim().removePrefix("$").trim().toDoubleOrNull() ?: 0.0
                    val draft = TransactionDraft(
                        id = existing?.id,
                        type = type,
                        accountId = accountId,
                        toAccountId = if (isTransfer) toAccountId else null,
                        amount = cleanedAmount,
                        date = date.trim(),
                        category = category.trim(),
                        subCategory = subCategory.trim(),
                        note = note.trim(),
                        cleared = cleared
                    ).normalized()

                    val problem = TransactionValidator.validate(draft, accounts.map { it.id }.toSet())
                    if (problem != null) error = problem else onSave(draft)
                }
            ) {
                Text("Save")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Cancel") }
        }
    )
}

@Composable
private fun DropdownPicker(
    label: String,
    selectedValue: String,
    options: List<String>,
    placeholder: String = "Select",
    onSelected: (String) -> Unit,
    onAddNew: () -> Unit
) {
    var expanded by remember { mutableStateOf(false) }

    Column {
        Text(label, style = MaterialTheme.typography.labelMedium)
        Box {
            OutlinedButton(onClick = { expanded = true }, modifier = Modifier.fillMaxWidth()) {
                Text(
                    text = selectedValue.ifBlank { placeholder },
                    modifier = Modifier.weight(1f),
                    maxLines = 1,
                    color = if (selectedValue.isNotBlank()) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurfaceVariant
                )
                Icon(Icons.Default.ArrowDropDown, contentDescription = null)
            }
            DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
                options.forEach { opt ->
                    DropdownMenuItem(
                        text = { Text(opt) },
                        onClick = {
                            onSelected(opt)
                            expanded = false
                        }
                    )
                }
                if (options.isNotEmpty()) {
                    HorizontalDivider()
                }
                DropdownMenuItem(
                    text = {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            Icon(Icons.Default.Add, contentDescription = null, modifier = Modifier.size(16.dp))
                            Text("Add new...", color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.SemiBold)
                        }
                    },
                    onClick = {
                        expanded = false
                        onAddNew()
                    }
                )
            }
        }
    }
}

@Composable
private fun AccountPicker(
    label: String,
    accounts: List<AccountEntity>,
    selectedId: String,
    onSelected: (String) -> Unit
) {
    var expanded by remember { mutableStateOf(false) }
    val selectedName = accounts.firstOrNull { it.id == selectedId }?.name ?: "Select account"

    Column {
        Text(label, style = MaterialTheme.typography.labelMedium)
        Box {
            OutlinedButton(onClick = { expanded = true }, modifier = Modifier.fillMaxWidth()) {
                Text(selectedName, modifier = Modifier.weight(1f), maxLines = 1)
                Icon(Icons.Default.ArrowDropDown, contentDescription = null)
            }
            DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
                accounts.forEach { acc ->
                    DropdownMenuItem(
                        text = { Text(acc.name) },
                        onClick = {
                            onSelected(acc.id)
                            expanded = false
                        }
                    )
                }
            }
        }
    }
}

@Composable
fun AddBudgetItemDialog(
    onDismiss: () -> Unit,
    onConfirm: (category: String, subCategory: String, amount: Double, frequency: String) -> Unit
) {
    var category by remember { mutableStateOf("HOUSE") }
    var subCategory by remember { mutableStateOf("") }
    var amountText by remember { mutableStateOf("") }
    var frequency by remember { mutableStateOf("Weekly") }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Add Budget Line Item", fontWeight = FontWeight.Bold) },
        text = {
            Column(
                modifier = Modifier.fillMaxWidth(),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                OutlinedTextField(
                    value = category,
                    onValueChange = { category = it.uppercase() },
                    label = { Text("Category Group (e.g. HOUSE, BILLS)") },
                    modifier = Modifier.fillMaxWidth()
                )
                OutlinedTextField(
                    value = subCategory,
                    onValueChange = { subCategory = it.uppercase() },
                    label = { Text("Sub-Category (e.g. RENT, INTERNET)") },
                    modifier = Modifier.fillMaxWidth()
                )
                OutlinedTextField(
                    value = amountText,
                    onValueChange = { amountText = it },
                    label = { Text("Amount ($)") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                    modifier = Modifier.fillMaxWidth()
                )
                Text("Input Frequency", style = MaterialTheme.typography.labelMedium)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    listOf("Weekly", "Monthly", "Yearly").forEach { freq ->
                        FilterChip(
                            selected = frequency == freq,
                            onClick = { frequency = freq },
                            label = { Text(freq) }
                        )
                    }
                }
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    val amount = amountText.toDoubleOrNull() ?: 0.0
                    if (subCategory.isNotBlank() && amount > 0) {
                        onConfirm(category, subCategory, amount, frequency)
                    }
                }
            ) {
                Text("Add")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Cancel") }
        }
    )
}

data class IncomeDraft(
    val id: String = java.util.UUID.randomUUID().toString(),
    var label: String = "",
    var amountText: String = ""
)

data class ContributionDraft(
    val id: String = java.util.UUID.randomUUID().toString(),
    var accountId: String = "",
    var amountText: String = ""
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ContributorDialog(
    existing: ContributorEntity? = null,
    existingAllocations: List<ContributionAllocationEntity> = emptyList(),
    accounts: List<AccountEntity>,
    onDismiss: () -> Unit,
    onSave: (
        name: String,
        incomes: List<Double>,
        allowance: Double,
        note: String,
        contributions: List<Pair<String, Double>>
    ) -> Unit,
    onDelete: (() -> Unit)? = null
) {
    var name by remember { mutableStateOf(existing?.name ?: "") }
    var note by remember { mutableStateOf(existing?.note ?: "") }

    val incomes = remember {
        mutableStateListOf<IncomeDraft>().apply {
            if (existing != null) {
                if (existing.income1 > 0) add(IncomeDraft(label = "Income 1", amountText = String.format(Locale.US, "%.2f", existing.income1)))
                if (existing.income2 > 0) add(IncomeDraft(label = "Income 2", amountText = String.format(Locale.US, "%.2f", existing.income2)))
                if (existing.income3 > 0) add(IncomeDraft(label = "Income 3", amountText = String.format(Locale.US, "%.2f", existing.income3)))
            }
            if (isEmpty()) {
                add(IncomeDraft(label = "Primary Income", amountText = ""))
            }
        }
    }

    val contributions = remember {
        mutableStateListOf<ContributionDraft>().apply {
            if (existing != null && existingAllocations.isNotEmpty()) {
                existingAllocations.forEach { alloc ->
                    add(ContributionDraft(accountId = alloc.accountId, amountText = String.format(Locale.US, "%.2f", alloc.amount)))
                }
            }
        }
    }

    val totalIncomes = incomes.sumOf { it.amountText.toDoubleOrNull() ?: 0.0 }
    val totalContributions = contributions.sumOf { it.amountText.toDoubleOrNull() ?: 0.0 }
    val weeklyAllowance = totalIncomes - totalContributions

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(if (existing == null) "Add Contributor" else "Edit Contributor", fontWeight = FontWeight.Bold) },
        text = {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(14.dp)
            ) {
                // Name
                OutlinedTextField(
                    value = name,
                    onValueChange = { name = it.uppercase() },
                    label = { Text("Contributor Name (e.g. VINCE, JENN)") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )

                // Add Income Section
                Card(
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                    shape = RoundedCornerShape(12.dp),
                    elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                text = "Weekly Incomes",
                                style = MaterialTheme.typography.titleSmall,
                                fontWeight = FontWeight.Bold,
                                color = MaterialTheme.colorScheme.primary
                            )
                            TextButton(
                                onClick = {
                                    incomes.add(IncomeDraft(label = "Income ${incomes.size + 1}", amountText = ""))
                                },
                                contentPadding = PaddingValues(horizontal = 8.dp, vertical = 2.dp)
                            ) {
                                Icon(Icons.Default.Add, contentDescription = "Add Income", modifier = Modifier.size(16.dp))
                                Spacer(modifier = Modifier.width(4.dp))
                                Text("Add Income")
                            }
                        }

                        if (incomes.isEmpty()) {
                            Text(
                                text = "No income sources added yet. Tap '+ Add Income' above to add an income source.",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        } else {
                            incomes.forEachIndexed { index, inc ->
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    OutlinedTextField(
                                        value = inc.label,
                                        onValueChange = { inc.label = it },
                                        label = { Text("Source") },
                                        singleLine = true,
                                        modifier = Modifier.weight(0.48f)
                                    )
                                    OutlinedTextField(
                                        value = inc.amountText,
                                        onValueChange = { inc.amountText = it },
                                        label = { Text("$ / Wk") },
                                        singleLine = true,
                                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                                        modifier = Modifier.weight(0.42f)
                                    )
                                    IconButton(
                                        onClick = {
                                            incomes.removeAt(index)
                                        },
                                        modifier = Modifier.size(32.dp)
                                    ) {
                                        Icon(
                                            Icons.Default.Delete,
                                            contentDescription = "Delete income field",
                                            tint = MaterialTheme.colorScheme.error.copy(alpha = 0.7f),
                                            modifier = Modifier.size(18.dp)
                                        )
                                    }
                                }
                            }
                        }
                    }
                }

                // Add Contribution -> Select Account / Goals Section
                Card(
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                    shape = RoundedCornerShape(12.dp),
                    elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                text = "Add Contribution",
                                style = MaterialTheme.typography.titleSmall,
                                fontWeight = FontWeight.Bold,
                                color = MaterialTheme.colorScheme.primary
                            )
                            TextButton(
                                onClick = {
                                    val defaultAcc = accounts.firstOrNull()?.id ?: ""
                                    contributions.add(ContributionDraft(accountId = defaultAcc, amountText = ""))
                                },
                                contentPadding = PaddingValues(horizontal = 8.dp, vertical = 2.dp)
                            ) {
                                Icon(Icons.Default.Add, contentDescription = "Add Contribution", modifier = Modifier.size(16.dp))
                                Spacer(modifier = Modifier.width(4.dp))
                                Text("Add Contribution")
                            }
                        }

                        if (contributions.isEmpty()) {
                            Text(
                                text = "Select Account/Goals to contribute toward shared expenses, savings, or sinking funds.",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        } else {
                            contributions.forEachIndexed { index, c ->
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    // Select Account / Goals Dropdown
                                    var expanded by remember { mutableStateOf(false) }
                                    val selectedAcc = accounts.find { it.id == c.accountId } ?: accounts.firstOrNull()

                                    Box(modifier = Modifier.weight(0.55f)) {
                                        OutlinedCard(
                                            onClick = { expanded = true },
                                            modifier = Modifier.fillMaxWidth()
                                        ) {
                                            Row(
                                                modifier = Modifier
                                                    .fillMaxWidth()
                                                    .padding(horizontal = 10.dp, vertical = 12.dp),
                                                horizontalArrangement = Arrangement.SpaceBetween,
                                                verticalAlignment = Alignment.CenterVertically
                                            ) {
                                                Text(
                                                    text = selectedAcc?.name ?: "Select Account",
                                                    style = MaterialTheme.typography.bodySmall,
                                                    fontWeight = FontWeight.SemiBold,
                                                    maxLines = 1
                                                )
                                                Icon(Icons.Default.ArrowDropDown, contentDescription = "Select")
                                            }
                                        }

                                        DropdownMenu(
                                            expanded = expanded,
                                            onDismissRequest = { expanded = false }
                                        ) {
                                            accounts.forEach { acc ->
                                                DropdownMenuItem(
                                                    text = {
                                                        Column {
                                                            Text(acc.name, fontWeight = FontWeight.Medium)
                                                            Text(acc.type, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.primary)
                                                        }
                                                    },
                                                    onClick = {
                                                        c.accountId = acc.id
                                                        expanded = false
                                                    }
                                                )
                                            }
                                        }
                                    }

                                    OutlinedTextField(
                                        value = c.amountText,
                                        onValueChange = { c.amountText = it },
                                        label = { Text("$ / Wk") },
                                        singleLine = true,
                                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                                        modifier = Modifier.weight(0.35f)
                                    )

                                    IconButton(
                                        onClick = { contributions.removeAt(index) },
                                        modifier = Modifier.size(32.dp)
                                    ) {
                                        Icon(
                                            Icons.Default.Delete,
                                            contentDescription = "Delete contribution",
                                            tint = MaterialTheme.colorScheme.error.copy(alpha = 0.7f),
                                            modifier = Modifier.size(18.dp)
                                        )
                                    }
                                }
                            }
                        }
                    }
                }

                // Weekly Allowance = Sum of Incomes - Sum of Contributions
                Card(
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer),
                    shape = RoundedCornerShape(12.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween
                        ) {
                            Text("Total Weekly Incomes:", style = MaterialTheme.typography.bodySmall)
                            Text("$%.2f".format(totalIncomes), fontWeight = FontWeight.Bold)
                        }
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween
                        ) {
                            Text("Total Contributions:", style = MaterialTheme.typography.bodySmall)
                            Text("-$%.2f".format(totalContributions), fontWeight = FontWeight.Bold)
                        }
                        HorizontalDivider(color = MaterialTheme.colorScheme.onPrimaryContainer.copy(alpha = 0.2f), modifier = Modifier.padding(vertical = 4.dp))
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                text = "Weekly Allowance:",
                                style = MaterialTheme.typography.bodyMedium,
                                fontWeight = FontWeight.Bold
                            )
                            Text(
                                text = "$%.2f".format(weeklyAllowance),
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.ExtraBold,
                                color = if (weeklyAllowance >= 0) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.error
                            )
                        }
                        Text(
                            text = "Weekly Allowance is the sum of all incomes minus sum of all contributions.",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onPrimaryContainer.copy(alpha = 0.8f)
                        )
                    }
                }

                // Notes Field
                OutlinedTextField(
                    value = note,
                    onValueChange = { note = it },
                    label = { Text("Notes / Details (Optional)") },
                    minLines = 2,
                    maxLines = 4,
                    modifier = Modifier.fillMaxWidth()
                )

                // Delete contributor action (if editing existing)
                if (existing != null && onDelete != null) {
                    OutlinedButton(
                        onClick = onDelete,
                        colors = ButtonDefaults.outlinedButtonColors(contentColor = MaterialTheme.colorScheme.error),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Icon(Icons.Default.Delete, contentDescription = "Delete Contributor")
                        Spacer(modifier = Modifier.width(8.dp))
                        Text("Delete Contributor")
                    }
                }
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    if (name.isNotBlank()) {
                        val validIncomes = incomes.mapNotNull { it.amountText.toDoubleOrNull() }.filter { it > 0 }
                        val validContributions = contributions.mapNotNull {
                            val amt = it.amountText.toDoubleOrNull() ?: 0.0
                            if (it.accountId.isNotBlank() && amt > 0) Pair(it.accountId, amt) else null
                        }
                        onSave(
                            name,
                            validIncomes,
                            weeklyAllowance,
                            note,
                            validContributions
                        )
                    }
                }
            ) {
                Text("Save")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Cancel") }
        }
    )
}

@Composable
fun AddContributorDialog(
    existing: ContributorEntity? = null,
    onDismiss: () -> Unit,
    onConfirm: (name: String, inc1: Double, inc2: Double, inc3: Double, allowance: Double) -> Unit,
    onDelete: (() -> Unit)? = null
) {
    ContributorDialog(
        existing = existing,
        existingAllocations = emptyList(),
        accounts = emptyList(),
        onDismiss = onDismiss,
        onSave = { name, incomes, allowance, _, _ ->
            onConfirm(
                name,
                incomes.getOrNull(0) ?: 0.0,
                incomes.getOrNull(1) ?: 0.0,
                incomes.getOrNull(2) ?: 0.0,
                allowance
            )
        },
        onDelete = onDelete
    )
}

@Composable
fun PaycheckCalcDialog(
    onDismiss: () -> Unit,
    onConfirm: (name: String, source: String, rate: Double, hours: Double, weeks: Int, tax: Double, invest: Double) -> Unit
) {
    var name by remember { mutableStateOf("VINCE") }
    var source by remember { mutableStateOf("MAIN JOB") }
    var rateText by remember { mutableStateOf("45.00") }
    var hoursText by remember { mutableStateOf("40.0") }
    var weeksText by remember { mutableStateOf("52") }
    var taxText by remember { mutableStateOf("425.00") }
    var investText by remember { mutableStateOf("0.00") }

    val rate = rateText.toDoubleOrNull() ?: 0.0
    val hours = hoursText.toDoubleOrNull() ?: 0.0
    val weeks = weeksText.toIntOrNull() ?: 52
    val tax = taxText.toDoubleOrNull() ?: 0.0
    val invest = investText.toDoubleOrNull() ?: 0.0

    val weeklyGross = rate * hours
    val yearlyGross = weeklyGross * weeks
    val weeklyNet = weeklyGross - tax - invest

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Weekly Income Generator", fontWeight = FontWeight.Bold) },
        text = {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                OutlinedTextField(
                    value = name,
                    onValueChange = { name = it.uppercase() },
                    label = { Text("Contributor Name") },
                    modifier = Modifier.fillMaxWidth()
                )
                OutlinedTextField(
                    value = source,
                    onValueChange = { source = it.uppercase() },
                    label = { Text("Income Source") },
                    modifier = Modifier.fillMaxWidth()
                )
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(
                        value = rateText,
                        onValueChange = { rateText = it },
                        label = { Text("Hourly Rate ($)") },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                        modifier = Modifier.weight(1f)
                    )
                    OutlinedTextField(
                        value = hoursText,
                        onValueChange = { hoursText = it },
                        label = { Text("Hours / Wk") },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                        modifier = Modifier.weight(1f)
                    )
                }
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(
                        value = taxText,
                        onValueChange = { taxText = it },
                        label = { Text("Weekly Tax ($)") },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                        modifier = Modifier.weight(1f)
                    )
                    OutlinedTextField(
                        value = investText,
                        onValueChange = { investText = it },
                        label = { Text("Invest ($)") },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                        modifier = Modifier.weight(1f)
                    )
                }

                Card(
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(modifier = Modifier.padding(12.dp)) {
                        Text("Weekly Gross: $%.2f".format(weeklyGross), fontWeight = FontWeight.SemiBold)
                        Text("Yearly Gross: $%.2f".format(yearlyGross), style = MaterialTheme.typography.bodySmall)
                        Spacer(modifier = Modifier.height(4.dp))
                        Text(
                            "Weekly Net Take-Home: $%.2f".format(weeklyNet),
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.onPrimaryContainer
                        )
                    }
                }
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    onConfirm(name, source, rate, hours, weeks, tax, invest)
                }
            ) {
                Text("Save to Calculator")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Cancel") }
        }
    )
}

@Composable
fun NewPeriodDialog(
    onDismiss: () -> Unit,
    onConfirm: (name: String, weeks: Int, startDate: String, endDate: String, note: String) -> Unit
) {
    var name by remember { mutableStateOf("") }
    var weeksText by remember { mutableStateOf("1") }
    var startDate by remember { mutableStateOf("") }
    var endDate by remember { mutableStateOf("") }
    var note by remember { mutableStateOf("") }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Create Budget Cycle / Period", fontWeight = FontWeight.Bold) },
        text = {
            Column(
                modifier = Modifier.fillMaxWidth(),
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                OutlinedTextField(
                    value = name,
                    onValueChange = { name = it },
                    label = { Text("Budget Name (e.g. Summer 2026)") },
                    modifier = Modifier.fillMaxWidth()
                )
                OutlinedTextField(
                    value = weeksText,
                    onValueChange = { weeksText = it },
                    label = { Text("# of Weeks Multiplier") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    modifier = Modifier.fillMaxWidth()
                )
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(
                        value = startDate,
                        onValueChange = { startDate = it },
                        label = { Text("Start Date") },
                        modifier = Modifier.weight(1f)
                    )
                    OutlinedTextField(
                        value = endDate,
                        onValueChange = { endDate = it },
                        label = { Text("End Date") },
                        modifier = Modifier.weight(1f)
                    )
                }
                OutlinedTextField(
                    value = note,
                    onValueChange = { note = it },
                    label = { Text("Notes / Scenarios") },
                    modifier = Modifier.fillMaxWidth()
                )
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    val w = weeksText.toIntOrNull() ?: 1
                    if (name.isNotBlank()) {
                        onConfirm(name, w, startDate, endDate, note)
                    }
                }
            ) {
                Text("Create")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Cancel") }
        }
    )
}
