import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import UserForm from './UserForm';

describe('UserForm (create mode)', () => {
  it('requires a valid email before continuing', () => {
    const onSubmit = vi.fn();
    render(<UserForm onSubmit={onSubmit} />);
    fireEvent.click(screen.getByText('Continue'));
    expect(screen.getByText('Valid email required')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('advances through steps and submits a clean payload', async () => {
    const onSubmit = vi.fn().mockResolvedValue({});
    render(<UserForm onSubmit={onSubmit} />);

    fireEvent.change(screen.getByPlaceholderText('user@example.com'), {
      target: { value: 'new@example.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('First name'), {
      target: { value: 'Ravi' },
    });
    fireEvent.change(screen.getByPlaceholderText('Last name'), {
      target: { value: 'Kumar' },
    });
    fireEvent.click(screen.getByText('Continue')); // -> Contact
    expect(screen.getByText(/Step 2 of 5/)).toBeInTheDocument();

    fireEvent.click(screen.getByText('Continue')); // -> Employment
    fireEvent.change(screen.getByPlaceholderText('Must be unique'), {
      target: { value: 'EMP-007' },
    });
    fireEvent.click(screen.getByText('Continue')); // -> Role
    fireEvent.change(screen.getByLabelText('Role *'), {
      target: { value: 'SUPERVISOR' },
    });
    fireEvent.click(screen.getByText('Continue')); // -> Review
    expect(screen.getByText('Create Profile')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Create Profile'));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const payload = onSubmit.mock.calls[0][0];
    expect(payload.email).toBe('new@example.com');
    expect(payload.full_name).toBe('Ravi Kumar');
    expect(payload.role).toBe('SUPERVISOR');
    expect(payload.employee_id).toBe('EMP-007');
  });

  it('rejects negative experience', () => {
    const onSubmit = vi.fn();
    render(<UserForm onSubmit={onSubmit} />);
    // jump to employment step by filling basics first
    fireEvent.change(screen.getByPlaceholderText('user@example.com'), {
      target: { value: 'a@b.co' },
    });
    fireEvent.change(screen.getByPlaceholderText('First name'), {
      target: { value: 'A' },
    });
    fireEvent.click(screen.getByText('Continue'));
    fireEvent.click(screen.getByText('Continue')); // employment
    fireEvent.change(screen.getByLabelText('Years of Experience'), {
      target: { value: '-3' },
    });
    fireEvent.click(screen.getByText('Continue'));
    expect(screen.getByText('Cannot be negative')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
