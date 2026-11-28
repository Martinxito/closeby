use anchor_lang::prelude::*;
use anchor_spl::token::Mint;

use crate::constants::CONFIG_SEED;
use crate::errors::EscrowError;
use crate::state::Config;

#[derive(Accounts)]
pub struct InitConfig<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(init, payer = admin, space = 8 + Config::INIT_SPACE, seeds = [CONFIG_SEED], bump)]
    pub config: Account<'info, Config>,

    pub usdc_mint: Account<'info, Mint>,

    /// Proves `admin` is the program's upgrade authority (whoever deployed it).
    #[account(constraint = program.programdata_address()? == Some(program_data.key()) @ EscrowError::Unauthorized)]
    pub program: Program<'info, crate::program::ClosebyEscrow>,
    #[account(constraint = program_data.upgrade_authority_address == Some(admin.key()) @ EscrowError::Unauthorized)]
    pub program_data: Account<'info, ProgramData>,

    pub system_program: Program<'info, System>,
}

pub fn handle_init_config(
    ctx: Context<InitConfig>,
    accept_window_secs: i64,
    grace_secs: i64,
    digital_claim_secs: i64,
    digital_review_secs: i64,
) -> Result<()> {
    require!(
        accept_window_secs > 0 && grace_secs > 0 && digital_claim_secs > 0 && digital_review_secs > 0,
        EscrowError::InvalidConfig
    );

    let config = &mut ctx.accounts.config;
    config.admin = ctx.accounts.admin.key();
    config.usdc_mint = ctx.accounts.usdc_mint.key();
    config.accept_window_secs = accept_window_secs;
    config.grace_secs = grace_secs;
    config.digital_claim_secs = digital_claim_secs;
    config.digital_review_secs = digital_review_secs;
    config.bump = ctx.bumps.config;
    Ok(())
}
