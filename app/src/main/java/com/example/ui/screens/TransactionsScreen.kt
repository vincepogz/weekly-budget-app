package com.example.ui.screens

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.widget.Toast
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.example.data.domain.TransactionDraft
import com.example.data.model.TransactionEntity
import com.example.data.model.TransactionType
import com.example.data.sync.PortableBackupManager
import com.example.ui.components.TransactionDialog
import com.example.ui.components.transactionAccountText
import com.example.ui.components.transactionAmountText
import com.example.ui.components.transactionStyle
import com.example.ui.components.transactionTitle
import com.example.ui.theme.ExpenseRed
import com.example.ui.viewmodel.BudgetUiState

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TransactionsScreen(
    state: BudgetUiState,
    onSaveTransaction: (TransactionDraft) -> Unit,
    onDeleteTransaction: (TransactionEntity) -> Unit
) {
    val context = LocalContext.current
    var showAddDialog by remember { mutableStateOf(false) }
    var editingTransaction by remember { mutableStateOf<TransactionEntity?>(null) }
    // null = ALL accounts
    var selectedAccountId by remember { mutableStateOf<String?>(null) }
    // null = ALL types
    var selectedFilter by remember { mutableStateOf<TransactionType?>(null) }
    var searchQuery by remember { mutableStateOf("") }

    val transactionsPool = if (state.allTransactions.isNotEmpty()) state.allTransactions else state.transactions

    val filteredTransactions = remember(
        transactionsPool,
        selectedAccountId,
        selectedFilter,
        searchQuery
    ) {
        transactionsPool.filter { t ->
            val matchesAccount = selectedAccountId == null ||
                    t.accountId == selectedAccountId ||
                    (t.transactionType == TransactionType.TRANSFER && t.toAccountId == selectedAccountId)
            val matchesFilter = selectedFilter == null || t.transactionType == selectedFilter
            val matchesSearch = searchQuery.isBlank() ||
                    t.payee.contains(searchQuery, ignoreCase = true) ||
                    t.note.contains(searchQuery, ignoreCase = true) ||
                    t.category.contains(searchQuery, ignoreCase = true) ||
                    t.subCategory.contains(searchQuery, ignoreCase = true)

            matchesAccount && matchesFilter && matchesSearch
        }.sortedWith(compareByDescending<TransactionEntity> { it.date }.thenByDescending { it.createdAt })
    }

    val pageSize = 10
    var visibleCount by remember(selectedAccountId, selectedFilter, searchQuery) { mutableStateOf(pageSize) }

    val displayedTransactions = remember(filteredTransactions, visibleCount) {
        filteredTransactions.take(visibleCount)
    }

    val listState = rememberLazyListState()

    val shouldLoadMore by remember {
        derivedStateOf {
            val totalItems = listState.layoutInfo.totalItemsCount
            val lastVisibleIndex = listState.layoutInfo.visibleItemsInfo.lastOrNull()?.index ?: 0
            totalItems > 0 && lastVisibleIndex >= totalItems - 2 && visibleCount < filteredTransactions.size
        }
    }

    LaunchedEffect(shouldLoadMore) {
        if (shouldLoadMore) {
            visibleCount = (visibleCount + pageSize).coerceAtMost(filteredTransactions.size)
        }
    }

    val selectedAccount = selectedAccountId?.let { id -> state.accounts.find { it.id == id } }

    val currentAccountBalance = if (selectedAccountId == null) {
        state.totalAccountBalances
    } else {
        state.balanceOf(selectedAccountId!!)
    }

    val currentAccountCleared = if (selectedAccountId == null) {
        state.totalClearedBalance
    } else {
        state.clearedBalanceOf(selectedAccountId!!)
    }

    Scaffold(
        floatingActionButton = {
            ExtendedFloatingActionButton(
                onClick = { showAddDialog = true },
                icon = { Icon(Icons.Default.Add, contentDescription = "Add") },
                text = { Text("Transaction") }
            )
        }
    ) { padding ->
        LazyColumn(
            state = listState,
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(horizontal = 16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
            contentPadding = PaddingValues(top = 16.dp, bottom = 96.dp)
        ) {
            // 1. Account Selector & Header Card (Account First)
            item {
                Card(
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer),
                    shape = RoundedCornerShape(16.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                text = "ACCOUNT LEDGER",
                                style = MaterialTheme.typography.labelMedium,
                                fontWeight = FontWeight.Bold,
                                color = MaterialTheme.colorScheme.onPrimaryContainer.copy(alpha = 0.7f)
                            )
                            IconButton(
                                onClick = {
                                    val backupManager = PortableBackupManager(context)
                                    val toExport = if (selectedAccountId == null) transactionsPool else filteredTransactions
                                    val csv = backupManager.exportTransactionsCsv(toExport, state.accounts)
                                    val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                                    clipboard.setPrimaryClip(ClipData.newPlainText("Transactions CSV", csv))
                                    Toast.makeText(context, "Exported ${toExport.size} transactions to CSV (copied to clipboard)", Toast.LENGTH_SHORT).show()
                                },
                                modifier = Modifier.size(28.dp)
                            ) {
                                Icon(
                                    Icons.Default.Download,
                                    contentDescription = "Export CSV",
                                    tint = MaterialTheme.colorScheme.onPrimaryContainer,
                                    modifier = Modifier.size(18.dp)
                                )
                            }
                        }

                        Spacer(modifier = Modifier.height(6.dp))

                        // Account name and balances
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Column(modifier = Modifier.weight(1f)) {
                                Text(
                                    text = selectedAccount?.name ?: "All Accounts",
                                    style = MaterialTheme.typography.titleLarge,
                                    fontWeight = FontWeight.Bold,
                                    color = MaterialTheme.colorScheme.onPrimaryContainer
                                )
                                Text(
                                    text = selectedAccount?.let { "Type: ${it.type}" } ?: "${state.accounts.size} Managed Accounts",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onPrimaryContainer.copy(alpha = 0.8f)
                                )
                            }

                            Column(horizontalAlignment = Alignment.End) {
                                Text(
                                    text = "$%.2f".format(currentAccountBalance),
                                    style = MaterialTheme.typography.headlineSmall,
                                    fontWeight = FontWeight.ExtraBold,
                                    color = MaterialTheme.colorScheme.onPrimaryContainer
                                )
                                Text(
                                    text = "Cleared: $%.2f".format(currentAccountCleared),
                                    style = MaterialTheme.typography.bodySmall,
                                    fontWeight = FontWeight.SemiBold,
                                    color = MaterialTheme.colorScheme.onPrimaryContainer.copy(alpha = 0.85f)
                                )
                            }
                        }

                        Spacer(modifier = Modifier.height(12.dp))
                        HorizontalDivider(color = MaterialTheme.colorScheme.onPrimaryContainer.copy(alpha = 0.15f))
                        Spacer(modifier = Modifier.height(10.dp))

                        // Account Selector Chips (Account First)
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .horizontalScroll(rememberScrollState()),
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            FilterChip(
                                selected = selectedAccountId == null,
                                onClick = { selectedAccountId = null },
                                label = { Text("All accounts") },
                                leadingIcon = if (selectedAccountId == null) {
                                    { Icon(Icons.Default.Check, contentDescription = null, modifier = Modifier.size(16.dp)) }
                                } else null
                            )
                            state.accounts.forEach { acc ->
                                FilterChip(
                                    selected = selectedAccountId == acc.id,
                                    onClick = { selectedAccountId = acc.id },
                                    label = { Text(acc.name) },
                                    leadingIcon = if (selectedAccountId == acc.id) {
                                        { Icon(Icons.Default.Check, contentDescription = null, modifier = Modifier.size(16.dp)) }
                                    } else null
                                )
                            }
                        }
                    }
                }
            }

            // Search Bar
            item {
                OutlinedTextField(
                    value = searchQuery,
                    onValueChange = { searchQuery = it },
                    placeholder = { Text("Search transactions...") },
                    leadingIcon = { Icon(Icons.Default.Search, contentDescription = "Search") },
                    trailingIcon = {
                        if (searchQuery.isNotBlank()) {
                            IconButton(onClick = { searchQuery = "" }) {
                                Icon(Icons.Default.Clear, contentDescription = "Clear")
                            }
                        }
                    },
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(12.dp)
                )
            }

            // Filter Chips (Transaction Types)
            item {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    FilterChip(
                        selected = selectedFilter == null,
                        onClick = { selectedFilter = null },
                        label = { Text("All") }
                    )
                    TransactionType.values().forEach { type ->
                        FilterChip(
                            selected = selectedFilter == type,
                            onClick = { selectedFilter = type },
                            label = { Text(type.label) }
                        )
                    }
                }
            }

            // Ledger stats
            item {
                val accountSpent = remember(filteredTransactions) {
                    filteredTransactions.filter { it.transactionType == TransactionType.WITHDRAWAL }.sumOf { it.amount }
                }
                val accountDeposits = remember(filteredTransactions) {
                    filteredTransactions.filter { it.transactionType == TransactionType.DEPOSIT }.sumOf { it.amount }
                }
                val accountTransfers = remember(filteredTransactions, selectedAccountId) {
                    filteredTransactions.filter {
                        it.transactionType == TransactionType.TRANSFER && (selectedAccountId == null || it.accountId == selectedAccountId)
                    }.sumOf { it.amount }
                }

                Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = if (filteredTransactions.size > displayedTransactions.size) {
                                "Showing ${displayedTransactions.size} of ${filteredTransactions.size} Records"
                            } else {
                                "${filteredTransactions.size} Records Found"
                            },
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        Text(
                            text = "Total Spent: $%.2f".format(accountSpent),
                            style = MaterialTheme.typography.bodySmall,
                            fontWeight = FontWeight.SemiBold,
                            color = ExpenseRed
                        )
                    }
                    val extras = buildList {
                        if (state.includeDeposits && accountDeposits > 0) add("Deposits: $%.2f".format(accountDeposits))
                        if (state.includeTransfers && accountTransfers > 0) add("Transfers: $%.2f".format(accountTransfers))
                    }
                    if (extras.isNotEmpty()) {
                        Text(
                            text = extras.joinToString("  •  "),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            }

            // Transactions list (sorted by date DESC, createdAt DESC)
            if (filteredTransactions.isEmpty()) {
                item {
                    Card(
                        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Box(modifier = Modifier.padding(24.dp), contentAlignment = Alignment.Center) {
                            Text("No transactions match the selected criteria.", style = MaterialTheme.typography.bodyMedium)
                        }
                    }
                }
            } else {
                items(displayedTransactions, key = { it.id }) { t ->
                    val style = transactionStyle(t.transactionType)
                    val details = buildString {
                        append(t.date)
                        append(" • ")
                        append(transactionAccountText(t, state.accounts))
                        if (t.cleared) append(" • Cleared")
                    }

                    Card(
                        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                        shape = RoundedCornerShape(12.dp),
                        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable { editingTransaction = t }
                    ) {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(12.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Row(
                                modifier = Modifier.weight(1f),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(12.dp)
                            ) {
                                Surface(
                                    shape = CircleShape,
                                    color = style.color.copy(alpha = 0.12f),
                                    modifier = Modifier.size(40.dp)
                                ) {
                                    Box(contentAlignment = Alignment.Center) {
                                        Icon(style.icon, contentDescription = t.transactionType.label, tint = style.color, modifier = Modifier.size(22.dp))
                                    }
                                }

                                Column {
                                    Text(
                                        text = transactionTitle(t),
                                        fontWeight = FontWeight.SemiBold,
                                        style = MaterialTheme.typography.bodyMedium
                                    )
                                    Text(
                                        text = details,
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant
                                    )
                                    if (t.note.isNotBlank()) {
                                        Text(
                                            text = t.note,
                                            style = MaterialTheme.typography.bodySmall,
                                            color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.8f)
                                        )
                                    }
                                }
                            }

                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text(
                                    text = transactionAmountText(t),
                                    fontWeight = FontWeight.Bold,
                                    color = style.color,
                                    style = MaterialTheme.typography.bodyLarge
                                )
                                IconButton(
                                    onClick = { onDeleteTransaction(t) },
                                    modifier = Modifier.size(32.dp)
                                ) {
                                    Icon(
                                        Icons.Default.DeleteOutline,
                                        contentDescription = "Delete",
                                        tint = MaterialTheme.colorScheme.error.copy(alpha = 0.6f),
                                        modifier = Modifier.size(18.dp)
                                    )
                                }
                            }
                        }
                    }
                }

                if (visibleCount < filteredTransactions.size) {
                    item {
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(vertical = 12.dp),
                            contentAlignment = Alignment.Center
                        ) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.Center,
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clickable {
                                        visibleCount = (visibleCount + pageSize).coerceAtMost(filteredTransactions.size)
                                    }
                                    .padding(8.dp)
                            ) {
                                CircularProgressIndicator(modifier = Modifier.size(16.dp), strokeWidth = 2.dp)
                                Spacer(modifier = Modifier.width(8.dp))
                                Text(
                                    text = "Scroll for more... (${displayedTransactions.size} of ${filteredTransactions.size})",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.primary
                                )
                            }
                        }
                    }
                }
            }
        }
    }

    if (showAddDialog) {
        TransactionDialog(
            accounts = state.accounts,
            initialAccountId = selectedAccountId,
            budgetItems = state.budgetItems,
            existingTransactions = state.transactions,
            onDismiss = { showAddDialog = false },
            onSave = { draft ->
                onSaveTransaction(draft)
                showAddDialog = false
            }
        )
    }

    editingTransaction?.let { t ->
        TransactionDialog(
            accounts = state.accounts,
            existing = t,
            initialAccountId = t.accountId,
            budgetItems = state.budgetItems,
            existingTransactions = state.transactions,
            onDismiss = { editingTransaction = null },
            onSave = { draft ->
                onSaveTransaction(draft)
                editingTransaction = null
            }
        )
    }
}
