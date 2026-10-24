package com.handyman.marketplace.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.handyman.marketplace.network.ApiService
import kotlinx.coroutines.launch

@Composable
fun JobDetailScreen(
    navController: androidx.navigation.navController,
    apiService: ApiService,
    jobId: String
) {
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf("") }
    var job by remember { mutableStateOf<com.handyman.marketplace.models.Job?>(null) }
    val coroutineScope = rememberCoroutineScope()

    LaunchedEffect(jobId) {
        val prefs = LocalContext.current.getSharedPreferences("handyman_prefs", android.content.Context.MODE_PRIVATE)
        val token = prefs.getString("auth_token", "") ?: ""
        coroutineScope.launch {
            try {
                val res = apiService.getJob("Bearer $token", jobId.toIntOrNull() ?: 0)
                if (res.isSuccessful) {
                    job = res.body()!!.job
                } else {
                    error = res.errorBody?.string() ?: "Failed to load job"
                }
            } catch (e: Exception) {
                error = e.message ?: "Failed to load job"
            } finally {
                loading = false
            }
        }
    }

    Scaffold(
        topBar = { TopAppBar(title = { Text("Job Details") }) }
    ) { padding ->
        if (loading) {
            Box(modifier = Modifier.fillMaxSize().padding(padding), contentAlignment = androidx.compose.ui.Alignment.Center) {
                CircularProgressIndicator()
            }
        } else if (error.isNotEmpty()) {
            Box(modifier = Modifier.fillMaxSize().padding(padding), contentAlignment = androidx.compose.ui.Alignment.Center) {
                Text(text = error, color = MaterialTheme.colorScheme.error)
            }
        } else if (job != null) {
            Column(
                modifier = Modifier.fillMaxSize().padding(padding),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Text(text = job?.title ?: "", style = MaterialTheme.typography.headlineSmall)
                Text(text = job?.description ?: "No description", style = MaterialTheme.typography.bodyMedium)
                Text(text = "Address: ${job?.address ?: ""}", style = MaterialTheme.typography.bodyMedium)
                Text(text = "Scheduled: ${job?.scheduled_at ?: ""}", style = MaterialTheme.typography.bodyMedium)
                Text(text = "Status: ${job?.status ?: ""}", style = MaterialTheme.typography.bodyMedium.copy(color = MaterialTheme.colorScheme.primary))
                Text(text = "Total: \$${job?.total_amount ?: 0.0}", style = MaterialTheme.typography.titleMedium)
                Text(text = "Platform fee (18%): \$${job?.platform_fee ?: 0.0}", style = MaterialTheme.typography.bodySmall)
                Text(text = "Handyman earns: \$${job?.handyman_earning ?: 0.0}", style = MaterialTheme.typography.bodySmall)

                Button(
                    onClick = { navController.navigate("booking/$jobId") },
                    enabled = job?.status == "pending"
                ) {
                    Text("Book & Pay")
                }

                if (job?.status == "completed" && job?.handyman_name != null) {
                    Button(
                        onClick = {
                            navController.navigate("review/$jobId") {
                                argument = androidx.navigation.NavArgument.Builder { }  // placeholder
                            }
                        }
                    ) {
                        Text("Leave Review")
                    }
                }

                Button(
                    onClick = { navController.popBackStack() },
                    modifier = Modifier.padding(top = 8.dp)
                ) {
                    Text("Back")
                }
            }
        }
    }
}
