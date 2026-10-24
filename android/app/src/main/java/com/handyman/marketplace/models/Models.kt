package com.handyman.marketplace.models

// ---------- Auth ----------
data class AuthRequest(
    val email: String,
    val password: String,
    val full_name: String? = null,
    val phone: String? = null,
    val role: String? = null,
    val address: String? = null,
    val category: String? = null,
    val hourly_rate: Double? = null,
    val bio: String? = null,
    val experience_years: Int? = null
)

data class AuthResponse(
    val token: String,
    val user: User
)

data class MeResponse(val user: User)

data class User(
    val id: Int,
    val email: String,
    val role: String,
    val full_name: String,
    val phone: String?,
    val address: String?,
    val created_at: String? = null
)

// ---------- Handymen ----------
data class HandymenResponse(val handymen: List<Handyman>)

data class Handyman(
    val id: Int,
    val full_name: String,
    val phone: String?,
    val address: String?,
    val category: String,
    val hourly_rate: Double,
    val bio: String?,
    val experience_years: Int,
    val is_available: Int,
    val rating: Double,
    val total_jobs: Int
)

data class HandymanDetailResponse(val handyman: Handyman)

// ---------- Jobs ----------
data class CreateJobRequest(
    val handyman_id: Int,
    val category_id: Int? = null,
    val title: String,
    val description: String? = null,
    val address: String,
    val scheduled_at: String,
    val total_amount: Double
)

data class JobResponse(val job: Job)

data class JobsResponse(val jobs: List<Job>)

data class Job(
    val id: Int,
    val client_id: Int,
    val handyman_id: Int?,
    val category_id: Int?,
    val title: String,
    val description: String?,
    val address: String,
    val scheduled_at: String,
    val status: String,
    val total_amount: Double,
    val platform_fee: Double,
    val handyman_earning: Double,
    val stripe_payment_intent_id: String?,
    val created_at: String?,
    val client_name: String? = null,
    val handyman_name: String? = null,
    val category_name: String? = null
)

data class UpdateJobStatusRequest(val status: String)
data class MessageResponse(val message: String)

// ---------- Payments ----------
data class CreatePaymentRequest(val job_id: Int)
data class PaymentIntentResponse(
    val client_secret: String,
    val paymentIntentId: String
)

data class ConfirmPaymentRequest(
    val payment_intent_id: String,
    val job_id: Int
)
data class PaymentConfirmResponse(val status: String, val message: String? = null)

data class EarningsResponse(
    val jobs: List<Job>,
    val total_earnings: Double,
    val platform_revenue: Double
)

// ---------- Reviews ----------
data class Review(
    val id: Int,
    val job_id: Int,
    val client_id: Int,
    val handyman_id: Int,
    val rating: Int,
    val comment: String?,
    val created_at: String?,
    val client_name: String? = null,
    val handyman_name: String? = null,
    val job_title: String? = null
)

data class ReviewRequest(val job_id: Int, val rating: Int, val comment: String? = null)
data class ReviewResponse(val reviews: List<Review>)

// ---------- Admin ----------
data class AdminStatsResponse(
    val users: Int,
    val handymen: Int,
    val clients: Int,
    val jobs: Int,
    val completed: Int,
    val pending: Int,
    val platform_revenue: Double
)

data class AdminUsersResponse(val users: List<User>)
data class AdminJobsResponse(val jobs: List<Job>)
data class SetRoleRequest(val role: String)
